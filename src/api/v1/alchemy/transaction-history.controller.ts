import { Controller, Get, Param, Res } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';

@Controller('api/v1/transaction-history')
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get(':walletAddress')
  async getSwapQuote(
    @Res() res,
    @Param('walletAddress') walletAddress: string,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        walletAddress,
      );
    res.status(200).json(data);
  }
}
