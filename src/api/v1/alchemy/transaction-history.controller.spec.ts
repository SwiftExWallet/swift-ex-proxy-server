import { Test, TestingModule } from '@nestjs/testing';
import { TransactionHistoryController } from '../alchemy/transaction-history.controller';

describe('TransactionHistoryController', () => {
  let controller: TransactionHistoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionHistoryController],
    }).compile();

    controller = module.get<TransactionHistoryController>(
      TransactionHistoryController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
