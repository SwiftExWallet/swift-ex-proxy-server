import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, StoreSwapOrderDto } from './dto/updateOrder.dto';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) { }

  @Post('store')
  async store(@Req() req: any, @Res() response: any, @Body() storeSwapOrderDto: StoreSwapOrderDto) {
    const stored = await this.swapOrderService.store(req.device, storeSwapOrderDto);
    response.send(stored);
  }

  @Get('/orderByWallet')
  async orderByWallet(@Query() multiChainWalletAddressDto: MultiChainWalletAddressDto) {
   return await this.swapOrderService.findByWallet(multiChainWalletAddressDto.address);
  }

  @Post('/bridgeOrderStatus')
  async bridgeOrderStatus(@Body() bridgeTxStatusDto: BridgeTxStatusDto) {
   return await this.swapOrderService.getBridgeTxStatus(bridgeTxStatusDto);
  }
}
