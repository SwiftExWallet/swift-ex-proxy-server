import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
} from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { GetQuoteDto, SupportedChain, TradeType } from './dto/quoter.dto';
import { SwapService } from './swaping/swap.service';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { CHAIN_CONFIGS } from './constants/quoter.chain.config';

@Controller('api/v1/quoter')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class QuoterController {
  constructor(
    private readonly quoterService: QuoterService,
    private readonly swapService: SwapService,
  ) { }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Body() dto: SwapQuoteDto) {
    const quote = await this.quoterService.getQuote(dto);
    return {
      success: true,
      data: quote,
    };
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