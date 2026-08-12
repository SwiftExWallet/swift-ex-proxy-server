import { Injectable } from '@nestjs/common';
import { swapProvider } from '../common/enums/chain.enum';
import { ExhaustedOrderRepository } from './exhaustedOrder.repository';
import type {
  ExhaustedOrderUpsertData,
  LeanExhaustedOrder,
} from './exhaustedOrder.repository';

export type { ExhaustedOrderUpsertData, LeanExhaustedOrder };

@Injectable()
export class ExhaustedOrderService {
  constructor(
    private readonly exhaustedOrderRepository: ExhaustedOrderRepository,
  ) {}

  async upsertByTxHash(
    txHash: string,
    data: ExhaustedOrderUpsertData,
  ): Promise<void> {
    return await this.exhaustedOrderRepository.upsertByTxHash(txHash, data);
  }

  async upsertBySwapOrderId(
    swapOrderId: string,
    data: ExhaustedOrderUpsertData & { txHash: string },
  ): Promise<void> {
    return await this.exhaustedOrderRepository.upsertBySwapOrderId(
      swapOrderId,
      data,
    );
  }

  async findPendingSince(
    provider: swapProvider,
    since: Date,
  ): Promise<LeanExhaustedOrder[]> {
    return await this.exhaustedOrderRepository.findPendingSince(
      provider,
      since,
    );
  }

  async deleteByTxHash(txHash: string): Promise<void> {
    return await this.exhaustedOrderRepository.deleteByTxHash(txHash);
  }

  async deleteById(id: string): Promise<void> {
    return await this.exhaustedOrderRepository.deleteById(id);
  }
}
