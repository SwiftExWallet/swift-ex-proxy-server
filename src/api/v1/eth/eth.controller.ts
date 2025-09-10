import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { EthService } from './eth.service';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';

@Controller('/api/v1/eth')
export class EthController {
  constructor(private readonly ethService: EthService) {}
  @Post('swap-quote')
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json(data);
  }

  @Post('transaction/broadcast')
  async broadcastTransaction(
    @Res() res,
    @Body() broadcastTransactionDto: BroadcastTransactionDto,
  ) {
    const data = await this.ethService.broadcastTransaction(
      broadcastTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post('swap-transaction/prepare')
  async swapPrepare(@Res() res, @Body() swapPrepareDto: SwapPrepareDto) {
    const data = await this.ethService.prepareSwapTransaction(swapPrepareDto);
    res.status(200).json(data);
  }

  @Post('swap-transaction/execute')
  async swapExecute(@Res() res, @Body('txs') txs: string[]) {
    const data = await this.ethService.executeSwapTransactions(txs);
    res.status(200).json(data);
  }

  @Post('token/info')
  async fetchTokenInfo(@Res() res, @Body() getTokenInfoDto: GetTokenInfoDto) {
    const data = await this.ethService.getTokenInfo(getTokenInfoDto);
    res.status(200).json(data);
  }

  @Post('transaction/prepare')
  async prepareTransaction(
    @Res() res,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.ethService.prepareTransaction(
      prepareTransactionDto,
    );
    res.status(200).json(data);
  }

  @Get('/:walletAddress/balance')
  async getBalance(@Res() res, @Param() walletAddressDto: WalletAddressDto) {
    const data = await this.ethService.getBalance(walletAddressDto);
    res.status(200).json(data);
  }

  @Get('wallet-address/:walletAddress/info')
  async getAddressInfo(
    @Res() res,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.ethService.getWalletAddressInfo(walletAddressDto);
    res.status(200).json(data);
  }
}
