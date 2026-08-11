import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
}
