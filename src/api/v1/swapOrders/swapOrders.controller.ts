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
  BridgeTxStatusDto,
  MultiChainWalletAddressDto,
  OrderByWalletQueryDto,
  StoreSwapOrderDto,
} from './dto/updateOrder.dto';
import { withVerifiedWalletAddress } from '../common/helpers/requestWallet';
import {
  RateLimit,
  rateLimitByIpAndDevice,
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
      withVerifiedWalletAddress(storeSwapOrderDto, req),
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
    return await this.swapOrderService.findOrdersForDeviceWallet(
      req.device._id,
      withVerifiedWalletAddress(query, req, 'address'),
    );
  }

  @Post('/bridgeOrderStatus')
  @BodySizeLimit(BODY_SIZE_LIMITS.simple, 'swap-orders-bridge-status')
  @RateLimit(
    ...rateLimitByIpAndDevice('swap-orders-bridge-status', {
      ip: 60,
      device: 30,
    }),
  )
  async bridgeOrderStatus(@Body() bridgeTxStatusDto: BridgeTxStatusDto) {
    return await this.swapOrderService.getBridgeTxStatus(bridgeTxStatusDto);
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
    const verifiedQuery = withVerifiedWalletAddress(query, req, 'address');
    return await this.swapOrderService.findOrderByHashForDeviceWallet(
      req.device._id,
      orderHash,
      verifiedQuery.address,
    );
  }
}
