import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { StoreSwapOrderDto } from './dto/updateOrder.dto';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import {
  PaginationDto,
  PaginatedResult,
  PAGE_SIZE,
} from './dto/pagination.dto';
import { PortfolioService } from '../portfolio/portfolio.service';

export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PUBLIC_ORDER_SELECT = '-deviceId -deviceFcmToken';

const SUCCESS_STATUSES = [SwapOrderStatus.COMPLETED, SwapOrderStatus.EXECUTED];

@Injectable()
export class SwapOrderRepository {
  private readonly logger = new Logger(SwapOrderRepository.name);

  constructor(
    @InjectModel(SwapOrders.name)
    private readonly model: Model<SwapOrders>,
    private readonly portfolioService: PortfolioService,
  ) {}

  private triggerPortfolioRefresh(
    order: SwapOrders | null,
    status: SwapOrderStatus,
  ): void {
    if (!order || !SUCCESS_STATUSES.includes(status)) {
      return;
    }

    const chains = [
      ...new Set([order.fromChain, order.toChain].filter(Boolean)),
    ];

    this.portfolioService
      .refreshPortfolio(String(order.deviceId), order.walletAddress, chains)
      .catch((err) =>
        this.logger.error('portfolio refresh trigger failed', {
          txHash: order.txHash,
          err,
        }),
      );
  }

  async create(dto: StoreSwapOrderDto): Promise<SwapOrders> {
    try {
      const doc = new this.model({
        ...dto,
        status: dto.status ?? SwapOrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
      });
      return await doc.save();
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          `Transaction "${dto.txHash}" already exists.`,
        );
      }
      this.logger.error('create failed', { txHash: dto.txHash, err });
      throw err;
    }
  }

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>> {
    try {
      const data = await this.model.findOne({ txHash }).exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findByTxHash failed', { txHash, err });
      return { ok: false, error: 'findByTxHash failed' };
    }
  }

  async findByTxHashForWallet(
    txHash: string,
    walletAddress: string,
  ): Promise<DbResult<SwapOrders | null>> {
    try {
      const data = await this.model
        .findOne({ txHash, walletAddress })
        .select(PUBLIC_ORDER_SELECT)
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findByTxHashForWallet failed', {
        txHash,
        walletAddress,
        err,
      });
      return { ok: false, error: 'findByTxHashForWallet failed' };
    }
  }

  async findByWallet(walletAddress: string): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({ walletAddress })
        .sort({ _id: -1 })
        .select(PUBLIC_ORDER_SELECT)
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findByWallet failed', {
        walletAddress,
        err,
      });
      return { ok: false, error: 'findByWallet failed' };
    }
  }

  async walletBelongsToDevice(
    deviceId: string,
    walletAddress: string,
  ): Promise<DbResult<boolean>> {
    try {
      const data = await this.model.exists({ deviceId, walletAddress }).exec();
      return { ok: true, data: Boolean(data) };
    } catch (err) {
      this.logger.error('walletBelongsToDevice failed', {
        deviceId,
        walletAddress,
        err,
      });
      return { ok: false, error: 'walletBelongsToDevice failed' };
    }
  }

  async findPendingByProvider(
    provider: swapProvider,
  ): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({ provider, status: SwapOrderStatus.PENDING })
        .lean()
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findPendingByProvider failed', { provider, err });
      return { ok: false, error: 'findPendingByProvider failed' };
    }
  }

  async findPendingByProviderSince(
    provider: swapProvider,
    since: Date,
  ): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({
          provider,
          status: SwapOrderStatus.PENDING,
          createdAt: { $gte: since },
        })
        .lean()
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findPendingByProviderSince failed', {
        provider,
        since,
        err,
      });
      return { ok: false, error: 'findPendingByProviderSince failed' };
    }
  }

  async findByProviderAndStatusesSince(
    provider: swapProvider,
    statuses: SwapOrderStatus[],
    since: Date,
  ): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({
          provider,
          status: { $in: statuses },
          createdAt: { $gte: since },
        })
        .lean()
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findByProviderAndStatusesSince failed', {
        provider,
        statuses,
        since,
        err,
      });
      return { ok: false, error: 'findByProviderAndStatusesSince failed' };
    }
  }

  async updateStatus(
    txHash: string,
    status: SwapOrderStatus,
    blockNumber: number | null = null,
  ): Promise<DbResult<void>> {
    try {
      const result = await this.model
        .findOneAndUpdate(
          { txHash },
          {
            $set: {
              status,
              confirmedAt: new Date(),
              blockNumber,
            },
          },
          { new: true },
        )
        .exec();

      if (!result) {
        this.logger.warn(`updateStatus no data found for txHash=${txHash}`);
        return { ok: false, error: 'updateStatus no data found' };
      }

      this.triggerPortfolioRefresh(result, status);

      return { ok: true, data: undefined };
    } catch (err) {
      this.logger.error('updateStatus failed', { txHash, status, err });
      return { ok: false, error: 'updateStatus failed' };
    }
  }

  async findByWalletWithPagination(
    walletAddress: string,
    pagination: PaginationDto,
  ): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    try {
      const page = pagination.page ?? 1;
      const limit = pagination.limit ?? PAGE_SIZE;
      const skip = (page - 1) * limit;

      const [total, data] = await Promise.all([
        this.model.countDocuments({ walletAddress }),
        this.model
          .find({ walletAddress })
          .select(PUBLIC_ORDER_SELECT)
          .sort({ _id: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        ok: true,
        data: {
          data,
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (err) {
      this.logger.error('findByWallet failed', {
        walletAddress,
        err,
      });
      return { ok: false, error: 'findByWallet failed' };
    }
  }

  async updateOrderStatus(
    txHash: string,
    status: SwapOrderStatus,
    blockNumber: number | null = null,
  ): Promise<SwapOrders | null> {
    try {
      const result = await this.model.findOneAndUpdate(
        { txHash },
        {
          $set: {
            status,
            confirmedAt: new Date(),
            blockNumber,
          },
        },
        {
          new: true,
        },
      );

      if (!result) {
        this.logger.warn(`order data not found for txHash=${txHash}`);
        throw new BadRequestException('order data not found');
      }

      this.triggerPortfolioRefresh(result, status);

      return result;
    } catch (err) {
      this.logger.error('order data not found', { txHash, status, err });
      throw new BadRequestException('order data not found');
    }
  }
}
