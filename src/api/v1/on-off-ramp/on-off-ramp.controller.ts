import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  OnOffRampAssetsQueryDto,
  OnOffRampLinkPayloadDto,
  OnOffRampOrderPayloadDto,
  OnOffRampQuotePayloadDto,
} from './dto/on-off-ramp.dto';
import { OnOffRampService } from './on-off-ramp.service';
import {
  RateLimit,
  rateLimitByIpAndDevice,
} from '../common/decorators/rate-limit.decorator';

@Controller('api/v1/on-off-ramp')
export class OnOffRampController {
  constructor(private readonly onOffRampService: OnOffRampService) {}

  @Post('quote')
  @RateLimit(
    ...rateLimitByIpAndDevice('on-off-ramp-quote', {
      ip: 60,
      device: 30,
    }),
  )
  async getQuote(@Body() payload: OnOffRampQuotePayloadDto) {
    return this.onOffRampService.getQuote(payload);
  }

  @Post('order')
  @RateLimit(
    ...rateLimitByIpAndDevice('on-off-ramp-order', {
      ip: 30,
      device: 15,
    }),
  )
  async createOrder(
    @Body() payload: OnOffRampOrderPayloadDto,
    @Req() req: any,
  ) {
    return this.onOffRampService.createOrder(payload, req.device);
  }

  @Get('assets')
  @RateLimit(
    ...rateLimitByIpAndDevice('on-off-ramp-assets', {
      ip: 60,
      device: 30,
    }),
  )
  async getAssets(@Query() query: OnOffRampAssetsQueryDto) {
    return this.onOffRampService.getAssets(query);
  }

  @Post('link')
  @RateLimit(
    ...rateLimitByIpAndDevice('on-off-ramp-link', {
      ip: 30,
      device: 15,
    }),
  )
  async buildLink(@Body() payload: OnOffRampLinkPayloadDto, @Req() req: any) {
    return this.onOffRampService.buildLink(payload, req.device);
  }
}
