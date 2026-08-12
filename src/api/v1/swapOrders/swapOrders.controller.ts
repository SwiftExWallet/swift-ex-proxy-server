import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';
import {
  MultiChainWalletAddressDto,
  OrderByWalletQueryDto,
  StoreSwapOrderDto,
} from './dto/updateOrder.dto';
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

@Controller('api/v1/swapOrders')
export class SwapOrdersController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  @Post('store')
  @BodySizeLimit(BODY_SIZE_LIMITS.swapOrder, 'swap-orders-store')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('swap-orders-store', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async store(
    @Req() req: any,
    @Res() response: any,
    @Body() storeSwapOrderDto: StoreSwapOrderDto,
  ) {
    const stored = await this.swapOrderService.store(
      req.device,
      storeSwapOrderDto,
      req.wallet,
    );
    response.send(stored);
  }

  @Get('/orderByWallet')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('swap-orders-by-wallet', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async orderByWallet(@Req() req: any, @Query() query: OrderByWalletQueryDto) {
    return await this.swapOrderService.findOrdersForVerifiedWallet(
      query,
      req.wallet,
    );
  }

  @Get('/:orderHash')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('swap-orders-by-hash', {
      ip: 120,
      device: 60,
      wallet: 60,
    }),
  )
  async getOrderByOrderhash(
    @Req() req: any,
    @Param('orderHash') orderHash: string,
    @Query() query: MultiChainWalletAddressDto,
  ) {
    return await this.swapOrderService.findOrderByHashForVerifiedWallet(
      orderHash,
      query,
      req.wallet,
    );
  }
}
