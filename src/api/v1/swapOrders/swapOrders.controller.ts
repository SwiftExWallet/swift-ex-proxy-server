import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import { StoreSwapOrderDto } from './dto/updateOrder.dto';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) { }

  @Post('store')
  async store(@Req() req: any, @Res() response: any, @Body() storeSwapOrderDto: StoreSwapOrderDto) {
    const stored = await this.swapOrderService.store(req.device, storeSwapOrderDto);
    response.send(stored);
  }
}
