import { Controller, HttpCode, HttpStatus, Post, Body, Req } from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { withVerifiedWalletAddress } from '../../common/helpers/requestWallet';

@Controller('api/v1/quoter')
export class QuoterController {
  constructor(private readonly quoterService: QuoterService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Req() req: any, @Body() body: SwapQuoteDto) {
    return await this.quoterService.getQuoteResponse(
      withVerifiedWalletAddress(body, req, 'recipient'),
    );
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Req() req: any, @Body() dto: SwapQuoteDto) {
    return await this.quoterService.buildSwapResponse(
      withVerifiedWalletAddress(dto, req, 'recipient'),
    );
  }
}
