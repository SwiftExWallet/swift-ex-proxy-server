import { Controller, Get, Param, Res } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';
import { ChainEnum } from '../common/enums/chain.enum';

@Controller('api/v1/transaction-history')
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get(':walletAddress/eth')
  async getEthWalletHistory(
    @Res() res,
    @Param('walletAddress') walletAddress: string,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        walletAddress,
        ChainEnum.ETH,
      );
    res.status(200).json(data);
  }

  @Get(':walletAddress/bsc')
  async getBscWalletHistory(
    @Res() res,
    @Param('walletAddress') walletAddress: string,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        walletAddress,
        ChainEnum.BSC,
      );
    res.status(200).json(data);
  }
}
