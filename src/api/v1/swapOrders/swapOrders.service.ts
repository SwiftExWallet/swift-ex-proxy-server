import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SwapOrders } from './schema/swapOrder.schema';
import { SwapOrderStatus } from '../common/enums/order.enum';
import {
  MultiChainWalletAddressDto,
  OrderByWalletQueryDto,
  StoreSwapOrderDto,
  UpdateTxStatusDto,
} from './dto/updateOrder.dto';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import { PaginatedResult } from './dto/pagination.dto';
import {
  getVerifiedWalletAddressFromWallet,
  resolveWalletChain,
  type Wallet,
  walletContainsAddress,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';
import { swapProvider } from '../common/enums/chain.enum';
import { NearIntentPollerService } from '../swap/nearIntent/nearIntentPoller.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { RedisService } from '../redis/redis.service';

const SUCCESS_STATUSES = [SwapOrderStatus.COMPLETED, SwapOrderStatus.EXECUTED];

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  constructor(
    private readonly swapOrderRepository: SwapOrderRepository,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => NearIntentPollerService))
    private readonly nearIntentPollerService: NearIntentPollerService,
    private readonly portfolioService: PortfolioService,
  ) {}

  async store(
    device: any,
    dto: StoreSwapOrderDto,
    verifiedWallet?: Wallet,
  ): Promise<SwapOrders> {
    const { txHash, quoteId, provider, memo } = dto;
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

      const order = {
        ...verifiedDto,
        usdValue,
        ...(device?._id ? { deviceId: device._id } : {}),
        ...(device?.fcmToken ? { deviceFcmToken: device.fcmToken } : {}),
      };

      if (provider === swapProvider.ONEINCH_FUSION_PLUS) {
        await this.redisService.setKey(
          `active_subscription:fusion_plus:${txHash}`,
          JSON.stringify({ orderHash: txHash, quoteId }),
        );
      }
      const createdOrder = await this.swapOrderRepository.create(order);
      if (provider === swapProvider.NEARINTENT) {
        const orderId = createdOrder._id.toHexString();
        void this.nearIntentPollerService
          .startPolling(txHash, orderId, memo)
          .catch((err) =>
            this.logger.error('Failed to start NEARINTENT poller', {
              txHash,
              orderId,
              err,
            }),
          );
      }
      return createdOrder;
    } catch (err: any) {
      if (err instanceof ConflictException) {
        throw err;
      }
      if (err.code === 11000) {
        throw new ConflictException(
          `Transaction with txHash "${dto.txHash}" already exists.`,
        );
      }
      this.logger.error('Failed to store transaction', err);
      throw new InternalServerErrorException('Could not save transaction.');
    }
  }

  async updateOrderStatus(
    orderHash: string,
    status: SwapOrderStatus,
  ): Promise<DbResult<void>> {
    const swapOrder = await this.swapOrderRepository.findByTxHash(orderHash);
    if (!swapOrder.ok || !swapOrder.data) {
      this.logger.error(`Swap order not found for orderHash ${orderHash}`);
      return { ok: false, error: 'updateStatus no data found' };
    }
    const result = await this.swapOrderRepository.updateStatus(
      orderHash,
      status,
    );
    if (result.ok) {
      this.triggerPortfolioRefresh(swapOrder.data, status);
    }
    return result;
  }

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>> {
    return await this.swapOrderRepository.findByTxHash(txHash);
  }

  async findById(id: string): Promise<DbResult<SwapOrders | null>> {
    return await this.swapOrderRepository.findById(id);
  }

  async findOrderByHashForVerifiedWallet(
    txHash: string,
    walletAddressOrQuery: string | MultiChainWalletAddressDto,
    verifiedWallet: Wallet,
  ): Promise<DbResult<SwapOrders | null>> {
    const walletAddress =
      typeof walletAddressOrQuery === 'string'
        ? this.resolveVerifiedQueryAddress(walletAddressOrQuery, verifiedWallet)
        : this.resolveVerifiedQueryAddress(
            walletAddressOrQuery.address,
            verifiedWallet,
          );
    return await this.swapOrderRepository.findByTxHashForWallet(
      txHash,
      walletAddress,
    );
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

  async findOrdersForVerifiedWallet(
    query: OrderByWalletQueryDto,
    verifiedWallet: Wallet,
  ): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    const verifiedQuery = {
      ...query,
      address: this.resolveVerifiedQueryAddress(query.address, verifiedWallet),
    };
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

  async updateOrderByHash(
    updateTxStatusDto: UpdateTxStatusDto,
  ): Promise<SwapOrders | null> {
    const order = await this.swapOrderRepository.updateOrderStatus(
      updateTxStatusDto.txHash,
      updateTxStatusDto.orderStatus,
    );
    this.triggerPortfolioRefresh(order, updateTxStatusDto.orderStatus);
    return order;
  }

  async updateOrderById(
    id: string,
    orderStatus: SwapOrderStatus,
  ): Promise<SwapOrders | null> {
    const order = await this.swapOrderRepository.updateOrderStatusById(
      id,
      orderStatus,
    );
    this.triggerPortfolioRefresh(order, orderStatus);
    return order;
  }

  private triggerPortfolioRefresh(
    order: SwapOrders | null,
    status: SwapOrderStatus,
  ): void {
    if (!order || !SUCCESS_STATUSES.includes(status) || !order.deviceId) {
      return;
    }

    const chains = [
      ...new Set([order.fromChain, order.toChain].filter(Boolean)),
    ];

    this.portfolioService
      .refreshPortfolio(order.deviceId.toString(), order.walletAddress, chains)
      .catch((err) =>
        this.logger.error('portfolio refresh trigger failed', {
          txHash: order.txHash,
          err,
        }),
      );
  }
}
