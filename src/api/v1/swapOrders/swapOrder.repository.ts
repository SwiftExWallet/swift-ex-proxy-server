import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { StoreSwapOrderDto, } from './dto/updateOrder.dto';
import { OrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

@Injectable()
export class SwapOrderRepository {
  private readonly logger = new Logger(SwapOrderRepository.name);

  constructor(
    @InjectModel(SwapOrders.name)
    private readonly model: Model<SwapOrders>,
  ) { }

  async create(dto: StoreSwapOrderDto): Promise<SwapOrders> {
    try {
      const doc = new this.model({
        ...dto,
        status: dto.status ?? OrderStatus.PENDING,
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

  async findByWallet(walletAddress: string): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({ walletAddress })
        .sort({ _id: -1 })
        .select('-deviceId -deviceFcmToken')
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findByWallet failed', { walletAddress, err });
      return { ok: false, error: 'findByWallet failed' };
    }
  }

  async findPendingByProvider(
    provider: swapProvider,
  ): Promise<DbResult<SwapOrders[]>> {
    try {
      const data = await this.model
        .find({ provider, status: OrderStatus.PENDING })
        .lean()
        .exec();
      return { ok: true, data };
    } catch (err) {
      this.logger.error('findPendingByProvider failed', { provider, err });
      return { ok: false, error: 'findPendingByProvider failed' };
    }
  }

  async updateStatus(
    txHash: string,
    status: OrderStatus,
    blockNumber: number | null = null,
  ): Promise<DbResult<void>> {
    try {
      const result = await this.model
        .updateOne(
          { txHash },
          {
            $set: {
              status,
              confirmedAt: new Date(),
              blockNumber,
            },
          },
        )
        .exec();

      if (result.matchedCount === 0) {
        this.logger.warn(`updateStatus no data found for txHash=${txHash}`);
        return { ok: false, error: 'updateStatus no data found' };
      }

      return { ok: true, data: undefined };
    } catch (err) {
      this.logger.error('updateStatus failed', { txHash, status, err });
      return { ok: false, error: 'updateStatus failed' };
    }
  }
}