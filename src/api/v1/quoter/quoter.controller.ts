import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

@Controller('api/v1/quoter')
export class QuoterController {
  constructor(private readonly quoterService: QuoterService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'quoter-quote')
  @RateLimit(
    { points: 60, duration: 60, key: 'quoter-quote-ip', keyBy: 'ip' },
    {
      points: 30,
      duration: 60,
      key: 'quoter-quote-device',
      keyBy: 'device',
    },
    {
      points: 30,
      duration: 60,
      key: 'quoter-quote-wallet',
      keyBy: 'wallet',
    },
  )
  async getQuote(@Req() req: any, @Body() body: SwapQuoteDto) {
    return await this.quoterService.getQuoteResponse(body, req.wallet);
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'quoter-swap')
  @RateLimit(
    { points: 30, duration: 60, key: 'quoter-swap-ip', keyBy: 'ip' },
    {
      points: 15,
      duration: 60,
      key: 'quoter-swap-device',
      keyBy: 'device',
    },
    {
      points: 15,
      duration: 60,
      key: 'quoter-swap-wallet',
      keyBy: 'wallet',
    },
  )
  async swapBuild(@Req() req: any, @Body() dto: SwapQuoteDto) {
    return await this.quoterService.buildSwapResponse(dto, req.wallet);
  }
}
