import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { BscService } from './bsc.service';
import { PrepareSwapTransactionDto } from './dto/prepareSwapTransaction.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { UsdtBalanceDto } from './dto/usdtBalance.dto';
import { PancakeSwapService } from './pancake/bsc.pancake.service';

@Controller('/api/v1/bsc')
export class BscController {
  constructor(
    private readonly bscService: BscService,
    private readonly pancakeSwapService:PancakeSwapService
  ) {}
  @Post('swap-quote')
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.pancakeSwapService.getSwapQuote(swapQuoteDto);
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

  @Post('swap-transaction/prepare')
  async swapPrepare(
    @Res() res,
    @Body() prepareSwapTransactionDto: PrepareSwapTransactionDto,
  ) {
    const data = await this.bscService.prepareSwapTransaction(
      prepareSwapTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post('token/info')
  async fetchTokenInfo(@Res() res, @Body() getTokenInfoDto: GetTokenInfoDto) {
    const data = await this.bscService.getTokenInfo(getTokenInfoDto);
    res.status(200).json(data);
  }

  @Get('/:walletAddress/balance')
  async getBalance(@Res() res, @Param() walletAddressDto: WalletAddressDto) {
    const data = await this.bscService.getBalance(walletAddressDto);
    res.status(200).json(data);
  }

  @Get('wallet-address/:walletAddress/info')
  async getAddressInfo(
    @Res() res,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.bscService.getWalletAddressInfo(walletAddressDto);
    res.status(200).json(data);
  }

  @Get('/:walletAddress/token/:tokenAddress/balance')
  async getUsdtBalance(@Res() res, @Param() usdtBalanceDto: UsdtBalanceDto) {
    const data = await this.bscService.getUsdtTokenBalance(usdtBalanceDto);
    res.status(200).json(data);
  }

  @Post('transaction/prepare')
  async prepareTransaction(
    @Res() res,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.bscService.prepareTransaction(
      prepareTransactionDto,
    );
    res.status(200).json(data);
  }
}
