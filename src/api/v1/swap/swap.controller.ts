import { Body, Controller, Post } from '@nestjs/common';
import { SwapQuoteDto } from './dto/swapQuote';
import { InchService } from './services/1inch/1inch.service';
import { FusionOrderDto } from './dto/fusionOrder';
import { SubmitOrderDto } from './dto/submitOrder';

@Controller('api/v1/swap/1inch')
export class SwapController {
  constructor(private readonly inchService: InchService) {}

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
