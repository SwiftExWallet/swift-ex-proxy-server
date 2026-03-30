import { Controller, Get, Param, Query, Res } from '@nestjs/common';
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
    walletAddressDto: WalletAddressDto,
    @Query('sentPageKey') sentPageKey?: string,
    @Query('receivedPageKey') receivedPageKey?: string,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        { ...walletAddressDto, sentPageKey, receivedPageKey },
        ChainEnum.ETH,
      );
    res.status(200).json(data);
  }

  @Get(':walletAddress/bsc')
  async getBscWalletHistory(
    @Res() res,
    @Param()
    walletAddressDto: WalletAddressDto,
    @Query('sentPageKey') sentPageKey?: string,
    @Query('receivedPageKey') receivedPageKey?: string,
  ) {
    const data =
      await this.transactionHistoryService.getWalletTransactionHistory(
        { ...walletAddressDto, sentPageKey, receivedPageKey },
        ChainEnum.BSC,
      );
    res.status(200).json(data);
  }
}
