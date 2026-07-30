import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { SwapOrderStatus } from '../common/enums/order.enum';
import {
  MultiChainWalletAddressDto,
  OrderByWalletQueryDto,
  StoreSwapOrderDto,
  UpdateTxStatusDto,
} from './dto/updateOrder.dto';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import {
  AllbridgeCoreSdk,
  ChainSymbol,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk';
import { PaginatedResult, PaginationDto } from './dto/pagination.dto';
import { WalletService } from '../wallet/wallet.service';
import {
  getVerifiedWalletAddressFromWallet,
  resolveWalletChain,
  type Wallet,
  walletContainsAddress,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';
import { swapProvider } from '../common/enums/chain.enum';
import { NearIntentPollerService } from '../swap/nearIntent/nearIntentPoller.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>,
    private readonly swapOrderRepository: SwapOrderRepository,
    private readonly walletService: WalletService,
    private readonly nearIntentPollerService: NearIntentPollerService,
  ) {}

  async store(
    device: any,
    dto: StoreSwapOrderDto,
    verifiedWallet?: Wallet,
  ): Promise<SwapOrders> {
    const { txHash, provider, memo } = dto;
    try {
      const verifiedDto = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            dto,
            verifiedWallet,
            'walletAddress',
            resolveWalletChain(dto.fromChain),
          )
        : dto;
      let usdValue = verifiedDto.usdValue;

      if (['USDT', 'USDC'].includes(verifiedDto.fromToken?.toUpperCase())) {
        usdValue = Number(verifiedDto.amountIn);
      }

      const doc = new this.swapOrders({
        ...verifiedDto,
        usdValue,
        deviceId: device._id,
        status: verifiedDto.status ?? SwapOrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
        deviceFcmToken: device.fcmToken,
      });

      if (provider === swapProvider.NEARINTENT) {
        this.nearIntentPollerService.startPolling(txHash, memo);
      }
      return await doc.save();
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          `Transaction with txHash "${dto.txHash}" already exists.`,
        );
      }
      this.logger.error('Failed to store transaction', err);
      throw new InternalServerErrorException('Could not save transaction.');
    }
  }

  async updateOrderStatus(orderHash: string, status: SwapOrderStatus) {
    const swapOrder = await this.swapOrderRepository.findByTxHash(orderHash);
    if (!swapOrder) {
      this.logger.error(`Swap order not found for orderHash ${orderHash}`);
      return;
    }
    return this.swapOrderRepository.updateStatus(orderHash, status);
  }

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>> {
    return await this.swapOrderRepository.findByTxHash(txHash);
  }

  async findByTxHashForWallet(
    deviceId: string,
    txHash: string,
    walletAddress: string,
  ): Promise<DbResult<SwapOrders | null>> {
    await this.assertWalletBelongsToDevice(deviceId, walletAddress);
    return await this.swapOrderRepository.findByTxHashForWallet(
      txHash,
      walletAddress,
    );
  }

  async findOrderByHashForDeviceWallet(
    deviceId: string,
    txHash: string,
    walletAddressOrQuery: string | MultiChainWalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<DbResult<SwapOrders | null>> {
    const walletAddress =
      typeof walletAddressOrQuery === 'string'
        ? walletAddressOrQuery
        : verifiedWallet
          ? this.resolveVerifiedQueryAddress(
              walletAddressOrQuery.address,
              verifiedWallet,
            )
          : walletAddressOrQuery.address;
    await this.assertWalletBelongsToDevice(deviceId, walletAddress);
    return await this.swapOrderRepository.findByTxHashForWallet(
      txHash,
      walletAddress,
    );
  }

  async findByWallet(
    deviceId: string,
    walletAddress: string,
  ): Promise<DbResult<SwapOrders[]>> {
    await this.assertWalletBelongsToDevice(deviceId, walletAddress);
    return await this.swapOrderRepository.findByWallet(walletAddress);
  }

  async findPendingByProvider(
    provider: swapProvider,
  ): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProvider(provider);
  }

  async findPendingByProviderSince(
    provider: swapProvider,
    since: Date,
  ): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProviderSince(
      provider,
      since,
    );
  }

  async findByProviderAndStatusesSince(
    provider: swapProvider,
    statuses: SwapOrderStatus[],
    since: Date,
  ): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByProviderAndStatusesSince(
      provider,
      statuses,
      since,
    );
  }

  async getBridgeTxStatus(bridgeTxStatusDto: any) {
    const { provider, walletType, txHash } = bridgeTxStatusDto;
    try {
      switch (provider) {
        case swapProvider.ALLBRIDGE:
          return await this.sdk.getTransferStatus(
            ChainSymbol[walletType],
            txHash,
          );
        default:
          return `${provider} service not active yet.`;
      }
    } catch {
      throw new BadRequestException(`Transaction not found.`);
    }
  }

  async findByWalletWithPagination(
    deviceId: string,
    multiChainWalletAddressDto: MultiChainWalletAddressDto,
    pagination: PaginationDto,
  ): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    await this.assertWalletBelongsToDevice(
      deviceId,
      multiChainWalletAddressDto.address,
    );
    return await this.swapOrderRepository.findByWalletWithPagination(
      multiChainWalletAddressDto.address,
      pagination,
    );
  }

  async findOrdersForDeviceWallet(
    deviceId: string,
    query: OrderByWalletQueryDto,
    verifiedWallet?: Wallet,
  ): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    const verifiedQuery = {
      ...query,
      address: verifiedWallet
        ? this.resolveVerifiedQueryAddress(query.address, verifiedWallet)
        : query.address,
    };
    await this.assertWalletBelongsToDevice(deviceId, verifiedQuery.address);
    return await this.swapOrderRepository.findByWalletWithPagination(
      verifiedQuery.address,
      verifiedQuery,
    );
  }

  private resolveVerifiedQueryAddress(
    queryAddress: string | undefined | null,
    verifiedWallet: Wallet,
  ): string {
    if (queryAddress) {
      if (!walletContainsAddress(verifiedWallet, queryAddress)) {
        throw new ForbiddenException(
          'address does not match the verified wallet address.',
        );
      }

      return queryAddress;
    }

    return getVerifiedWalletAddressFromWallet(verifiedWallet);
  }

  private async assertWalletBelongsToDevice(
    deviceId: string,
    walletAddress: string,
  ): Promise<void> {
    let verifiedWallet: { walletId: string; address: string } | null;

    try {
      verifiedWallet = await this.walletService.verifyWalletForDevice(
        deviceId,
        walletAddress,
      );
    } catch {
      throw new InternalServerErrorException(
        'Could not verify wallet ownership.',
      );
    }

    if (!verifiedWallet) {
      throw new ForbiddenException(
        'Wallet address is not associated with this device.',
      );
    }
  }

  async updateOrderByHash(
    updateTxStatusDto: UpdateTxStatusDto,
  ): Promise<SwapOrders | null> {
    return await this.swapOrderRepository.updateOrderStatus(
      updateTxStatusDto.txHash,
      updateTxStatusDto.orderStatus,
    );
  }
}
