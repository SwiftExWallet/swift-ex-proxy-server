import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import { BridgeService } from './bridge.service';

import { BridgeQuoteDto } from './dto/bridge-quote.dto';
import { CreateBridgeDto } from './dto/create-bridge.dto';
import { EvmSignatureDto } from './dto/evm-signature.dto';
import { StellarSignatureDto } from './dto/stellar-signature.dto';
import { SourceTxDto } from './dto/source-tx.dto';
import { BridgeDirection } from './types/bridge-direction.type';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
} from '../common/helpers/requestWallet';

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly bridge: BridgeService) {}

  @Post('quote')
  quote(@Req() req: any, @Body() body: BridgeQuoteDto) {
    this.assertSourceWallet(req, body);
    return this.bridge.quote(body);
  }

  @Post()
  start(@Req() req: any, @Body() body: CreateBridgeDto) {
    this.assertSourceWallet(req, body);
    return this.bridge.create(body);
  }

  @Post(':id/evm-signature')
  async submitEvmSignature(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: EvmSignatureDto,
  ) {
    await this.bridge.assertAccess(id, req.wallet);
    return this.bridge.submitEvmSignature(id, body.signedTx);
  }

  @Post(':id/source-tx')
  async submitSourceTx(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SourceTxDto,
  ) {
    await this.bridge.assertAccess(id, req.wallet);
    return this.bridge.submitSourceTx(id, body.txHash);
  }

  @Post(':id/stellar-signature')
  async submitStellarSignature(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: StellarSignatureDto,
  ) {
    await this.bridge.assertAccess(id, req.wallet);
    return this.bridge.submitStellarSignature(id, body.signedXdr);
  }

  @Get(':id')
  async status(@Req() req: any, @Param('id') id: string) {
    await this.bridge.assertAccess(id, req.wallet);
    return this.bridge.getStatus(id);
  }

  private assertSourceWallet(
    req: any,
    body: Pick<BridgeQuoteDto, 'direction' | 'evmAddress' | 'stellarAddress'>,
  ): void {
    if (!req?.wallet) {
      return;
    }

    const stellarSource = body.direction === BridgeDirection.STELLAR_TO_EVM;
    const verified = getVerifiedWalletAddress(
      req,
      stellarSource ? SupportedWalletChain.xlm : SupportedWalletChain.multi,
    );
    assertWalletAddressMatches(
      stellarSource ? body.stellarAddress : body.evmAddress,
      verified,
      stellarSource ? 'stellarAddress' : 'evmAddress',
    );
  }
}
