import { Body, Controller, Post, Get } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { InchService } from './1inch.service';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';

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

  @Post('/fusion-plus/getSwapQuote')
  async getFusionPlusQuote(@Body() swapQuote: FusionPlusSwapQuoteDto) {
    const data = await this.inchService.getFusionPlusSwapQuote(swapQuote);
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

  @Post('/buildFusionPlusOrder')
  async createFusionPlusOrder(@Body() fusionPlusOrder: FusionPlusOrderDto) {
    const data = await this.inchService.buildFusionPlusOrder(fusionPlusOrder);
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

  @Post('/submitFusionPlusOrder')
  async submitFusionPlusOrder(@Body() submitOrderDto: SubmitOrderDto) {
    const data = await this.inchService.submitFusionPlusOrder(submitOrderDto);
    console.log('===== data =====');
    console.log(data);
    return data;
  }
}
