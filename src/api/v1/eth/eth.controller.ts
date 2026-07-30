import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { EthService } from './eth.service';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { ExecuteSwapTransactionsDto } from './dto/executeSwapTransactions.dto';
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

@Controller('/api/v1/eth')
export class EthController {
  constructor(private readonly ethService: EthService) {}
  @Post('swap-quote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'eth-swap-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-swap-quote', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json(data);
  }

  @Post('transaction/broadcast')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'eth-transaction-broadcast',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-transaction-broadcast', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
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
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'eth-swap-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-swap-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async swapPrepare(
    @Req() req: any,
    @Res() res,
    @Body() swapPrepareDto: SwapPrepareDto | SwapQuoteDto,
  ) {
    const data = await this.ethService.prepareSwapTransaction(
      swapPrepareDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post('swap-transaction/execute')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'eth-swap-transaction-execute',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-swap-transaction-execute', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
  async swapExecute(
    @Res() res,
    @Body() executeSwapTransactionsDto: ExecuteSwapTransactionsDto,
  ) {
    const data = await this.ethService.executeSwapTransactions(
      executeSwapTransactionsDto.txs,
      executeSwapTransactionsDto.broadcastChain,
    );
    res.status(200).json(data);
  }

  @Post('token/info')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'eth-token-info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-token-info', {
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
    const data = await this.ethService.getTokenInfo(
      getTokenInfoDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Post('transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'eth-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-transaction-prepare', {
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
    const data = await this.ethService.prepareTransaction(
      prepareTransactionDto,
      req.wallet,
    );
    res.status(200).json(data);
  }

  @Get('/:walletAddress/balance')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-balance', {
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
    const data = await this.ethService.getBalance(walletAddressDto, req.wallet);
    res.status(200).json(data);
  }

  @Get('wallet-address/:walletAddress/info')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('eth-wallet-info', {
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
    const data = await this.ethService.getWalletAddressInfo(
      walletAddressDto,
      req.wallet,
    );
    res.status(200).json(data);
  }
}
