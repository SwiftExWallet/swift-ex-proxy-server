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

@Controller('api/v1/quoter')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class QuoterController {
  constructor(
    private readonly quoterService: QuoterService,
    private readonly swapService: SwapService,
  ) { }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Body() dto: GetQuoteDto) {
    const quote = await this.quoterService.getQuote(dto);
    return {
      success: true,
      data: quote,
    };
  }

  @Get('chains')
  @HttpCode(HttpStatus.OK)
  getSupportedChains() {
    const { CHAIN_CONFIGS } = require('./constants/chain.config');
    return {
      success: true,
      data: Object.entries(CHAIN_CONFIGS).map(([key, cfg]: [string, any]) => ({
        key,
        chainId: cfg.chainId,
        name: cfg.name,
        nativeSymbol: cfg.nativeSymbol,
        wrappedNative: cfg.wrappedNative,
        quoterV2: cfg.uniswapV3QuoterV2,
      })),
    };
  }

  @Post('token-info')
  @HttpCode(HttpStatus.OK)
  async getTokenInfo(
    @Body() chain: SupportedChain,
    @Body() address: string,
  ) {
    const info = await this.quoterService.getTokenInfo(chain, address);
    return { success: true, data: info };
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Body() dto: SwapQuoteDto) {
    const quote = await this.swapService.buildSwapTx(dto);
    return {
      success: true,
      data: quote,
    };
  }
}