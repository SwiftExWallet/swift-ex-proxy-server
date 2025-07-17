import { Body, Controller, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { EthService } from './eth.service';
import { WalletAddressInfoDto } from './dto/walletAddressInfo.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';

@Controller('/api/v1/eth')
export class EthController {
  constructor(private readonly ethService: EthService) {}
  @Post('getSwapQuote')
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json(data);
  }

  @Post('walletAddress/info')
  async getAddressInfo(
    @Res() res,
    @Body() walletAddressInfoDto: WalletAddressInfoDto,
  ) {
    const data =
      await this.ethService.getWalletAddressInfo(walletAddressInfoDto);
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

  @Post('swapTransaction/prepare')
  async swapPrepare(@Res() res, @Body() swapPrepareDto: SwapPrepareDto) {
    const data = await this.ethService.prepareSwapTransaction(swapPrepareDto);
    res.status(200).json(data);
  }

  @Post('swapTransaction/execute')
  async swapExecute(@Res() res, @Body('txs') txs: string[]) {
    const data = await this.ethService.executeSwapTransactions(txs);
    res.status(200).json(data);
  }

  @Post('getTokenInfo')
  async fetchTokenInfo(@Res() res, @Body() getTokenInfoDto: GetTokenInfoDto) {
    const data = await this.ethService.getTokenInfo(getTokenInfoDto);
    res.status(200).json(data);
  }
}
