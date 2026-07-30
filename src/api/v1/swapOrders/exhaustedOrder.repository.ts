import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExhaustedOrder } from './schema/exhaustedOrder.schema';
import { swapProvider } from '../common/enums/chain.enum';

interface UpsertData {
  provider: swapProvider;
  memo?: string | null;
  swapOrderId?: string | null;
  deviceFcmToken?: string | null;
}

export type LeanExhaustedOrder = ExhaustedOrder & { _id: Types.ObjectId };

@Injectable()
export class ExhaustedOrderRepository {
  constructor(
    @InjectModel(ExhaustedOrder.name)
    private readonly model: Model<ExhaustedOrder>,
  ) {}

  // Fusion+ orderHash is genuinely unique per order, so txHash is a safe match key here.
  async upsertByTxHash(txHash: string, data: UpsertData): Promise<void> {
    await this.model.findOneAndUpdate(
      { txHash },
      { txHash, exhaustedAt: new Date(), ...data },
      { upsert: true },
    );
  }

  // NEARINTENT deposit addresses (Stellar-origin swaps) can repeat across orders,
  // so swapOrderId is the only safe match key there.
  async upsertBySwapOrderId(
    swapOrderId: string,
    data: UpsertData & { txHash: string },
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { swapOrderId },
      { swapOrderId, exhaustedAt: new Date(), ...data },
      { upsert: true },
    );
  }

  async findPendingSince(provider: swapProvider, since: Date): Promise<LeanExhaustedOrder[]> {
    return this.model.find({ provider, exhaustedAt: { $gte: since } }).lean().exec();
  }

  async deleteByTxHash(txHash: string): Promise<void> {
    await this.model.deleteOne({ txHash }).exec();
  }

  async deleteById(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }).exec();
  }
}
