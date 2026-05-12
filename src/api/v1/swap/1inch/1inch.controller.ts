import { Body, Controller, Post, Get, Query, Req } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { InchService } from './1inch.service';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';

@Controller('api/v1/swap/1inch')
export class inchController {
  constructor(private readonly inchService: InchService) {}

  @RateLimit(
    { points: 20, duration: 60, key: 'per-minute' }, // max 5 per minute
    { points: 20, duration: 3600, key: 'per-hour' }, // max 20 per hour
    { points: 100, duration: 86400, key: 'per-day' }, // max 100 per day
  )
  @Post('/getSwapQuote')
  async getQuote(@Body() swapQuote: SwapQuoteDto) {
    const data = await this.inchService.getSwapQuote(swapQuote);
    return data;
  }

  @Post('/fusion-plus/getSwapQuote')
  async getFusionPlusQuote(@Body() swapQuote: FusionPlusSwapQuoteDto) {
    const data = await this.inchService.getFusionPlusSwapQuote(swapQuote);
    return data;
  }

  @Post('/buildFusionOrder')
  async createFusionOrder(@Body() fusionOrder: FusionOrderDto) {
    const data = await this.inchService.buildFusionOrder(fusionOrder);
    return data;
  }

  @Post('/buildFusionPlusOrder')
  async createFusionPlusOrder(@Body() fusionPlusOrder: FusionPlusOrderDto) {
    const data = await this.inchService.buildFusionPlusOrder(fusionPlusOrder);
    return data;
  }

  @Post('/submitOrder')
  async submitOrder(@Req() req: any, @Body() submitOrderDto: SubmitOrderDto) {
    const data = await this.inchService.submitFusionOrder(req.device, submitOrderDto);
    return data;
  }

  @Post('/submitFusionPlusOrder')
  async submitFusionPlusOrder(@Req() req: any, @Body() submitOrderDto: SubmitOrderDto) {
    const data = await this.inchService.submitFusionPlusOrder(req.device, submitOrderDto);
    return data;
  }

  @Get('/orderStatus')
  async orderStatus(@Query() inchOrderStatusDto: InchOrderStatusDto) {
    const data = await this.inchService.orderStatus(inchOrderStatusDto);
    return data;
  }
}
