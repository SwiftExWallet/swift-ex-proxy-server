import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { BscService } from './bsc.service';
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
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

@Controller('/api/v1/bsc')
export class BscController {
  constructor(
    private readonly bscService: BscService,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {}
  @Post('swap-quote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'bsc-swap-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-swap-quote', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async getSwapQuote(
    @Req() req: any,
    @Res() res,
    @Body() swapQuoteDto: SwapQuoteDto,
  ) {
    const normalizedDto = await this.tokenMetadataService.normalizeSwapQuote(
      withVerifiedWalletAddress(swapQuoteDto, req, 'recipient'),
    );
    const data = await this.bscService.getSwapQuote(normalizedDto);
    res.status(200).json(data);
  }

  @Post('transaction/broadcast')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'bsc-transaction-broadcast',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-transaction-broadcast', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
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
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'bsc-swap-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-swap-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async swapPrepare(
    @Req() req: any,
    @Res() res,
    @Body() prepareSwapTransactionDto: SwapQuoteDto,
  ) {
    const normalizedDto = await this.tokenMetadataService.normalizeSwapQuote(
      withVerifiedWalletAddress(prepareSwapTransactionDto, req, 'recipient'),
    );
    const data = await this.bscService.prepareSwapTransaction(normalizedDto);
    res.status(200).json(data);
  }

  @Post('token/info')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'bsc-token-info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-token-info', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
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
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
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
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-wallet-info', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
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
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-token-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
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
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'bsc-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bsc-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
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
