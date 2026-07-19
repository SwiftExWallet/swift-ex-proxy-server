import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, OrderByWalletQueryDto, StoreSwapOrderDto } from './dto/updateOrder.dto';
import { withVerifiedWalletAddress } from '../common/helpers/requestWallet';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) { }

  @Post('store')
  async store(@Req() req: any, @Res() response: any, @Body() storeSwapOrderDto: StoreSwapOrderDto) {
    const stored = await this.swapOrderService.store(
      req.device,
      withVerifiedWalletAddress(storeSwapOrderDto, req),
    );
    response.send(stored);
  }

  @Get('/orderByWallet')
  async orderByWallet(@Req() req: any, @Query() query: OrderByWalletQueryDto) {
   return await this.swapOrderService.findOrdersForDeviceWallet(
     req.device._id,
     withVerifiedWalletAddress(query, req, 'address'),
   );
  }

  @Post('/bridgeOrderStatus')
  async bridgeOrderStatus(@Body() bridgeTxStatusDto: BridgeTxStatusDto) {
   return await this.swapOrderService.getBridgeTxStatus(bridgeTxStatusDto);
  }

  @Get('/:orderHash')
  async getOrderByOrderhash(@Req() req: any, @Param('orderHash') orderHash: string, @Query() query: MultiChainWalletAddressDto) {
    const verifiedQuery = withVerifiedWalletAddress(query, req, 'address');
    return await this.swapOrderService.findOrderByHashForDeviceWallet(req.device._id, orderHash, verifiedQuery.address);
  }
}
