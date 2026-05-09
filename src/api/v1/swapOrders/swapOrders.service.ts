import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { SwapOrders } from './schema/swapOrder.schema';
import { StoreSwapOrderDto } from './dto/updateOrder.dto';
import { OrderStatus } from '../common/enums/order.enum';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);

  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>
  ) { }

  @Cron('* * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Cron job for polling pending running...');
  }

  async store(_id: mongoose.Schema.Types.ObjectId, dto: StoreSwapOrderDto): Promise<SwapOrders> {
    try {
      const doc = new this.swapOrders({
        ...dto,
        deviceId: _id,
        status: dto.status ?? OrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
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

  async findByTxHash(txHash: string): Promise<SwapOrders | null> {
    return this.swapOrders.findOne({ txHash }).exec();
  }

  async findByWallet(walletAddress: string): Promise<SwapOrders[]> {
    return this.swapOrders.find({ walletAddress }).exec();
  }
}