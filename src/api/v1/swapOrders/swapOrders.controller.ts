import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, OrderByWalletQueryDto, StoreSwapOrderDto, UpdateTxStatusDto } from './dto/updateOrder.dto';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) { }

  @Post('store')
  async store(@Req() req: any, @Res() response: any, @Body() storeSwapOrderDto: StoreSwapOrderDto) {
    const stored = await this.swapOrderService.store(req.device, storeSwapOrderDto);
    response.send(stored);
  }

  @Get('/orderByWallet')
  async orderByWallet(@Req() req: any, @Query() query: OrderByWalletQueryDto) {
   return await this.swapOrderService.findOrdersForDeviceWallet(req.device._id, query);
  }

  @Post('/bridgeOrderStatus')
  async bridgeOrderStatus(@Body() bridgeTxStatusDto: BridgeTxStatusDto) {
   return await this.swapOrderService.getBridgeTxStatus(bridgeTxStatusDto);
  }

  @Put('/updateStatus')
  async updateStatus(@Body() updateTxStatusDto: UpdateTxStatusDto) {
   return await this.swapOrderService.updateOrder(updateTxStatusDto);
  }

  @Get('/:orderHash')
  async getOrderByOrderhash(@Req() req: any, @Param('orderHash') orderHash: string, @Query() query: MultiChainWalletAddressDto) {
    return await this.swapOrderService.findOrderByHashForDeviceWallet(req.device._id, orderHash, query.address);
  }
}
