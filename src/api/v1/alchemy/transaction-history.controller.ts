import { Controller, Get, Param, Res } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';
import { ChainEnum } from '../common/enums/chain.enum';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';

@Controller('api/v1/transaction-history')
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get(':walletAddress/eth')
  async getEthWalletHistory(
    @Res() res,
    @Param()
    walletAddress: WalletAddressDto,
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
    @Param()
    walletAddressDto: WalletAddressDto,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        walletAddressDto,
        ChainEnum.BSC,
      );
    res.status(200).json(data);
  }
}
