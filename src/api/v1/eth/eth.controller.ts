import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { EthService } from './eth.service';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { ExecuteSwapTransactionsDto } from './dto/executeSwapTransactions.dto';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from '../common/helpers/requestWallet';

@Controller('/api/v1/eth')
export class EthController {
  constructor(
    private readonly ethService: EthService,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {}
  @Post('swap-quote')
  async getSwapQuote(
    @Req() req: any,
    @Res() res,
    @Body() swapQuoteDto: SwapQuoteDto,
  ) {
    const normalizedDto = await this.tokenMetadataService.normalizeSwapQuote(
      withVerifiedWalletAddress(swapQuoteDto, req, 'recipient'),
    );
    const data = await this.ethService.getSwapQuote(normalizedDto);
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
  async swapPrepare(
    @Req() req: any,
    @Res() res,
    @Body() swapPrepareDto: SwapPrepareDto | SwapQuoteDto,
  ) {
    const verifiedDto =
      'tokenIn' in swapPrepareDto && 'tokenOut' in swapPrepareDto
        ? withVerifiedWalletAddress(swapPrepareDto, req, 'recipient')
        : withVerifiedWalletAddress(swapPrepareDto, req, 'address');
    const normalizedDto =
      'tokenIn' in verifiedDto && 'tokenOut' in verifiedDto
        ? await this.tokenMetadataService.normalizeSwapQuote(verifiedDto)
        : verifiedDto;
    const data = await this.ethService.prepareSwapTransaction(normalizedDto);
    res.status(200).json(data);
  }

  @Post('swap-transaction/execute')
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
  async fetchTokenInfo(
    @Req() req: any,
    @Res() res,
    @Body() getTokenInfoDto: GetTokenInfoDto,
  ) {
    const data = await this.ethService.getTokenInfo(
      withVerifiedWalletAddress(getTokenInfoDto, req),
    );
    res.status(200).json(data);
  }

  @Post('transaction/prepare')
  async prepareTransaction(
    @Req() req: any,
    @Res() res,
    @Body() prepareTransactionDto: PrepareTransactionDto,
  ) {
    const data = await this.ethService.prepareTransaction(
      withVerifiedWalletAddress(prepareTransactionDto, req),
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
    const data = await this.ethService.getBalance({
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
    const data = await this.ethService.getWalletAddressInfo({
      walletAddress: verifiedWalletAddress,
    });
    res.status(200).json(data);
  }
}
