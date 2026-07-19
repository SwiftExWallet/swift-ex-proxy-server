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
import { BridgeTxStatusDto, MultiChainWalletAddressDto, OrderByWalletQueryDto, StoreSwapOrderDto, UpdateTxStatusDto } from './dto/updateOrder.dto';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import { AllbridgeCoreSdk, ChainSymbol, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import { PaginatedResult, PaginationDto } from './dto/pagination.dto';
import { swapProvider } from '../common/enums/chain.enum';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>,
    private readonly swapOrderRepository: SwapOrderRepository,
    private readonly walletService: WalletService,
  ) { 
  }

  async store(device:any, dto: StoreSwapOrderDto): Promise<SwapOrders> {
    try {
      let usdValue = dto.usdValue;

      if (['USDT', 'USDC'].includes(dto.fromToken?.toUpperCase())) {
        usdValue = Number(dto.amountIn);
      }

      const doc = new this.swapOrders({
        ...dto,
        usdValue,
        deviceId: device._id,
        status: dto.status ?? SwapOrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
        deviceFcmToken: device.fcmToken,
      });
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

  async updateOrderStatus(orderHash: string, status: SwapOrderStatus){
    const swapOrder = await this.swapOrderRepository.findByTxHash(orderHash);
    if(!swapOrder){
      this.logger.error(`Swap order not found for orderHash ${orderHash}`);
      return;
    }
    return this.swapOrderRepository.updateStatus(orderHash, status)
  }

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>>  {
    return await this.swapOrderRepository.findByTxHash(txHash);
  }

  async findByTxHashForWallet(txHash: string, walletAddress: string): Promise<DbResult<SwapOrders | null>>  {
    return await this.swapOrderRepository.findByTxHashForWallet(txHash, walletAddress);
  }

  async findOrderByHashForDeviceWallet(deviceId: string, txHash: string, walletAddress: string): Promise<DbResult<SwapOrders | null>>  {
    await this.assertWalletBelongsToDevice(deviceId, walletAddress);
    return await this.swapOrderRepository.findByTxHashForWallet(txHash, walletAddress);
  }

  async findByWallet(walletAddress: string): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByWallet(walletAddress)
  }

  async findPendingByProvider(provider: swapProvider): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProvider(provider);
  }

  async findPendingByProviderSince(provider: swapProvider, since: Date): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProviderSince(provider, since);
  }

  async findByProviderAndStatusesSince(provider: swapProvider, statuses: SwapOrderStatus[], since: Date): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByProviderAndStatusesSince(provider, statuses, since);
  }

  async getBridgeTxStatus(bridgeTxStatusDto:any) {
    const { provider, walletType, txHash, } = bridgeTxStatusDto;
    try {
      switch (provider) {
        case swapProvider.ALLBRIDGE:
          return await this.sdk.getTransferStatus(
            ChainSymbol[walletType],
            txHash,
          );
        default:
          return `${provider} service not active yet.`
      }

    } catch (err) {
      throw new BadRequestException(`Transaction not found.`);
    }
  }

    async findByWalletWithPagination(multiChainWalletAddressDto: MultiChainWalletAddressDto,pagination:PaginationDto): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    return await this.swapOrderRepository.findByWalletWithPagination(multiChainWalletAddressDto.address,pagination)
  }

  async findOrdersForDeviceWallet(deviceId: string, query: OrderByWalletQueryDto): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    await this.assertWalletBelongsToDevice(deviceId, query.address);
    return await this.swapOrderRepository.findByWalletWithPagination(query.address, query)
  }

  private async assertWalletBelongsToDevice(deviceId: string, walletAddress: string): Promise<void> {
    let verifiedWallet: { walletId: string; address: string } | null;

    try {
      verifiedWallet = await this.walletService.verifyWalletForDevice(deviceId, walletAddress);
    } catch {
      throw new InternalServerErrorException('Could not verify wallet ownership.');
    }

    if (!verifiedWallet) {
      throw new ForbiddenException('Wallet address is not associated with this device.');
    }
  }

  async updateOrderByHash(updateTxStatusDto: UpdateTxStatusDto): Promise<SwapOrders|null>  {
    return await this.swapOrderRepository.updateOrderStatus(updateTxStatusDto.txHash,updateTxStatusDto.orderStatus);
  }
}
