import { Body, Controller, Post, Res } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';
import { TransactionHistoryDto } from './dto/transaction-history.dto';

@Controller('api/v1/transaction-history')
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) { }

  @Post()
  async getWalletHistory(
    @Res() res: any,
    @Body() transactionHistoryDto: TransactionHistoryDto,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(transactionHistoryDto);
    res.status(200).json(data);
  }
}
