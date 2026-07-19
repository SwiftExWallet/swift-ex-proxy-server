import { Controller, HttpCode, HttpStatus, Post, Body } from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';

@Controller('api/v1/quoter')
export class QuoterController {
  constructor(private readonly quoterService: QuoterService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Body() body: SwapQuoteDto) {
    return await this.quoterService.getQuoteResponse(body);
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Body() dto: SwapQuoteDto) {
    return await this.quoterService.buildSwapResponse(dto);
  }
}
