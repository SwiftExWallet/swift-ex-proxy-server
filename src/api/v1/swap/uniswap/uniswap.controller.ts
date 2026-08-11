import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../../common/decorators/body-size-limit.decorator';
import { UniswapService } from './uniswap.service';

@Controller('api/v1/swap')
export class UniswapController {
  constructor(private readonly uniswapService: UniswapService) {}

  @Post('')
  @HttpCode(HttpStatus.OK)
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'uniswap-swap')
  @RateLimit(
    { points: 30, duration: 60, key: 'uniswap-swap-ip', keyBy: 'ip' },
    {
      points: 15,
      duration: 60,
      key: 'uniswap-swap-device',
      keyBy: 'device',
    },
    {
      points: 15,
      duration: 60,
      key: 'uniswap-swap-wallet',
      keyBy: 'wallet',
    },
  )
  async swapBuild(@Req() req: any, @Body() dto: SwapQuoteDto) {
    return await this.uniswapService.buildSwapResponse(dto, req.wallet);
  }
}
