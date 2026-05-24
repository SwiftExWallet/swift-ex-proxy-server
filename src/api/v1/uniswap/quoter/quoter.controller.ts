import {
  Controller,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
} from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { RangoService } from '../../swap/rango/rango.service';
import { InchService } from '../../swap/1inch/1inch.service';
import { SwapProviderResolver } from './swaping/swap-provider.resolver';

@Controller('api/v1/quoter')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))

export class QuoterController {
  constructor(
    private readonly quoterService: QuoterService,
    private readonly swapProviderResolver: SwapProviderResolver,
  ) { }


  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Body() body: SwapQuoteDto) {
    return this.swapProviderResolver.getQuoteByProvider(body)
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Body() dto: SwapQuoteDto) {
    const quote = await this.quoterService.buildSwapTx(dto);
    return {
      success: true,
      data: quote,
    };
  }
}