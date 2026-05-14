import { Body, Controller, Get, Post, Put, Query, Req, Res } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, StoreSwapOrderDto, UpdateTxStatusDto } from './dto/updateOrder.dto';
import { PaginationDto } from './dto/pagination.dto';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) { }

  @Post('store')
  async store(@Req() req: any, @Res() response: any, @Body() storeSwapOrderDto: StoreSwapOrderDto) {
    const stored = await this.swapOrderService.store(req.device, storeSwapOrderDto);
    response.send(stored);
  }

  @Get('/orderByWallet')
  async orderByWallet(@Query() multiChainWalletAddressDto: MultiChainWalletAddressDto,@Query() pagination: PaginationDto) {
   return await this.swapOrderService.findByWalletWithPagination(multiChainWalletAddressDto,pagination);
  }

  @Post('/bridgeOrderStatus')
  async bridgeOrderStatus(@Body() bridgeTxStatusDto: BridgeTxStatusDto) {
   return await this.swapOrderService.getBridgeTxStatus(bridgeTxStatusDto);
  }

  @Put('/updateStatus')
  async updateStatus(@Body() updateTxStatusDto: UpdateTxStatusDto) {
   return await this.swapOrderService.updateOrder(updateTxStatusDto);
  }
}
