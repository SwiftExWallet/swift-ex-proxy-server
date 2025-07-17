import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { BscService } from './bsc.service';
import { PrepareSwapTransactionDto } from './dto/prepareSwapTransaction.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';

@Controller('/api/v1/bsc')
export class BscController {
  constructor(private readonly bscService: BscService) {}
  @Post('getSwapQuote')
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.bscService.getSwapQuote(swapQuoteDto);
    res.status(200).json(data);
  }

  @Post('transaction/broadcast')
  async broadcastTransaction(
    @Res() res,
    @Body() broadcastTransactionDto: BroadcastTransactionDto,
  ) {
    const data = await this.bscService.broadcastTransaction(
      broadcastTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post('swapTransaction/prepare')
  async swapPrepare(
    @Res() res,
    @Body() prepareSwapTransactionDto: PrepareSwapTransactionDto,
  ) {
    const data = await this.bscService.prepareSwapTransaction(
      prepareSwapTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post('getTokenInfo')
  async fetchTokenInfo(@Res() res, @Body() getTokenInfoDto: GetTokenInfoDto) {
    const data = await this.bscService.getTokenInfo(getTokenInfoDto);
    res.status(200).json(data);
  }

  @Get('/:address/balance')
  async getBalance(@Res() res, @Param('address') address: string) {
    const data = await this.bscService.getBalance(address);
    res.status(200).json(data);
  }

  @Get('/:address/usdt/balance')
  async getUsdtBalance(@Res() res, @Param('address') address: string) {
    const data = await this.bscService.getUsdtTokenBalance(address);
    res.status(200).json(data);
  }
}
