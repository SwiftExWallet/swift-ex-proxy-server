import { Body, Controller, Post, Get } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { InchService } from './1inch.service';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@Controller('api/v1/swap/1inch')
export class inchController {
  constructor(private readonly inchService: InchService) {}

  @RateLimit(1, 60)
  @Post('/getSwapQuote')
  async getQuote(@Body() swapQuote: SwapQuoteDto) {
    const data = await this.inchService.getSwapQuote(swapQuote);
    console.log('===== data =====');
    console.log(data);
    return data;
  }

  @Post('/buildFusionOrder')
  async createFusionOrder(@Body() fusionOrder: FusionOrderDto) {
    const data = await this.inchService.buildFusionOrder(fusionOrder);
    console.log('===== data =====');
    console.log(data);
    return data;
  }

  @Post('/submitOrder')
  async submitOrder(@Body() submitOrderDto: SubmitOrderDto) {
    const data = await this.inchService.submitOrder(submitOrderDto);
    console.log('===== data =====');
    console.log(data);
    return data;
  }
}
