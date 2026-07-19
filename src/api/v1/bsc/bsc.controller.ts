import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { BscService } from './bsc.service';
import { PrepareSwapTransactionDto } from './dto/prepareSwapTransaction.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { UsdtBalanceDto } from './dto/usdtBalance.dto';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from '../common/helpers/requestWallet';

@Controller('/api/v1/bsc')
export class BscController {
  constructor(
    private readonly bscService: BscService,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {}
  @Post('swap-quote')
  async getSwapQuote(@Req() req: any, @Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const normalizedDto =
      await this.tokenMetadataService.normalizeSwapQuote(
        withVerifiedWalletAddress(swapQuoteDto, req, 'recipient'),
      );
    const data = await this.bscService.getSwapQuote(normalizedDto)
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
    @Req() req: any,
    @Res() res,
    @Body() prepareSwapTransactionDto: SwapQuoteDto,
  ) {
    const normalizedDto =
      await this.tokenMetadataService.normalizeSwapQuote(
        withVerifiedWalletAddress(prepareSwapTransactionDto, req, 'recipient'),
      );
    const data = await this.bscService.prepareSwapTransaction(
      normalizedDto,
    );
    res.status(200).json(data);
  }

  @Post('token/info')
  async fetchTokenInfo(
    @Req() req: any,
    @Res() res,
    @Body() getTokenInfoDto: GetTokenInfoDto,
  ) {
    const data = await this.bscService.getTokenInfo(
      withVerifiedWalletAddress(getTokenInfoDto, req),
    );
    res.status(200).json(data);
  }

  @Get('/:walletAddress/balance')
  async getBalance(
    @Req() req: any,
    @Res() res,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const verifiedWalletAddress = getVerifiedWalletAddress(req);
    assertWalletAddressMatches(
      walletAddressDto.walletAddress,
      verifiedWalletAddress,
    );
    const data = await this.bscService.getBalance({
      walletAddress: verifiedWalletAddress,
    });
    res.status(200).json(data);
  }

  @Get('wallet-address/:walletAddress/info')
  async getAddressInfo(
    @Req() req: any,
    @Res() res,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const verifiedWalletAddress = getVerifiedWalletAddress(req);
    assertWalletAddressMatches(
      walletAddressDto.walletAddress,
      verifiedWalletAddress,
    );
    const data = await this.bscService.getWalletAddressInfo({
      walletAddress: verifiedWalletAddress,
    });
    res.status(200).json(data);
  }

  @Get('/:walletAddress/token/:tokenAddress/balance')
  async getUsdtBalance(
    @Req() req: any,
    @Res() res,
    @Param() usdtBalanceDto: UsdtBalanceDto,
  ) {
    const data = await this.bscService.getUsdtTokenBalance(
      withVerifiedWalletAddress(usdtBalanceDto, req),
    );
    res.status(200).json(data);
  }

  @Post('transaction/prepare')
  async prepareTransaction(
    @Req() req: any,
    @Res() res,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.bscService.prepareTransaction(
      withVerifiedWalletAddress(prepareTransactionDto, req),
    );
    res.status(200).json(data);
  }
}
