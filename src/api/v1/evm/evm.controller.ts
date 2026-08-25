import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { EvmService } from './evm.service';

@Controller('/api/v1/evm')
export class EvmController {
  constructor(private readonly evmService: EvmService) {}

  @Post('swap-quote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-swap-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-swap-quote', {
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
    const data = await this.evmService.getSwapQuote(swapQuoteDto, req.wallet);
    res.status(200).json(data);
  }

  @Post('swap-transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-swap-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-swap-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async prepareSwap(
    @Req() req: any,
    @Res() res,
    @Body() swapQuoteDto: SwapQuoteDto,
  ) {
    const data = await this.evmService.prepareSwapTransaction(
      swapQuoteDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post(':chain/transaction/broadcast')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'evm-transaction-broadcast',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-transaction-broadcast', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
  async broadcastTransaction(
    @Res() res,
    @Param('chain') chain: string,
    @Body() broadcastTransactionDto: BroadcastTransactionDto,
  ) {
    const data = await this.evmService.broadcastTransaction(
      chain,
      broadcastTransactionDto,
    );
    res.status(200).json(data);
  }

  @Post(':chain/token/info')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-token-info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-token-info', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async fetchTokenInfo(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Body() getTokenInfoDto: GetTokenInfoDto,
  ) {
    const data = await this.evmService.getTokenInfo(
      chain,
      getTokenInfoDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/:walletAddress/balance')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getBalance(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.evmService.getBalance(
      chain,
      walletAddressDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/wallet-address/:walletAddress/info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-wallet-info', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getAddressInfo(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    const data = await this.evmService.getWalletAddressInfo(
      chain,
      walletAddressDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get(':chain/:walletAddress/token/:tokenAddress/balance')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-token-balance', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getTokenBalance(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Param() tokenBalanceDto: WalletAddressDto & { tokenAddress: string },
  ) {
    const data = await this.evmService.getTokenBalance(
      chain,
      tokenBalanceDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post(':chain/transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'evm-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('evm-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async prepareTransaction(
    @Req() req: any,
    @Res() res,
    @Param('chain') chain: string,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.evmService.prepareTransaction(
      chain,
      prepareTransactionDto,
      req.wallet,
    );
    res.status(200).json(data);
  }
}
