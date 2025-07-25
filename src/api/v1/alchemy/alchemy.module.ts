import { Module } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';
import { TransactionHistoryController } from './transaction-history.controller';

@Module({
  providers: [TransactionHistoryService],
  controllers: [TransactionHistoryController],
})
export class AlchemyModule {}
