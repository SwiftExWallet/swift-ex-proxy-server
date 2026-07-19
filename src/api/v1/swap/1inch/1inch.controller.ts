import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  Req,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { InchService } from './1inch.service';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { ConfirmSwapOrderDto } from '../dto/prepareTxDto';
import { NotificationDto } from '../../notification/dto/notification.dto';
import { CustomNotificationOriginGuard } from '../../common/guard/custom-notification-origin.guard';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from '../../common/helpers/requestWallet';

@Controller('api/v1/swap/1inch')
export class inchController {
  constructor(
    private readonly inchService: InchService,
    private readonly fustionNativeService: FustionNativeService,
  ) {}

  @RateLimit(
    { points: 20, duration: 60, key: 'per-minute' }, // max 5 per minute
    { points: 20, duration: 3600, key: 'per-hour' }, // max 20 per hour
    { points: 100, duration: 86400, key: 'per-day' }, // max 100 per day
  )
  @Post('/getSwapQuote')
  async getQuote(@Req() req: any, @Body() swapQuote: SwapQuoteDto) {
    const data = await this.inchService.getSwapQuote(
      withVerifiedWalletAddress(swapQuote, req),
    );
    return data;
  }

  @Post('/fusion-plus/getSwapQuote')
  async getFusionPlusQuote(
    @Req() req: any,
    @Body() swapQuote: FusionPlusSwapQuoteDto,
  ) {
    const data = await this.inchService.getFusionPlusSwapQuote(
      withVerifiedWalletAddress(swapQuote, req),
    );
    return data;
  }

  @Post('/buildFusionOrder')
  async createFusionOrder(
    @Req() req: any,
    @Body() fusionOrder: FusionOrderDto,
  ) {
    const data = await this.inchService.buildFusionOrder(
      withVerifiedWalletAddress(fusionOrder, req),
    );
    return data;
  }

  @Post('/buildFusionPlusOrder')
  async createFusionPlusOrder(
    @Req() req: any,
    @Body() fusionPlusOrder: FusionPlusOrderDto,
  ) {
    const data = await this.inchService.buildFusionPlusOrder(
      withVerifiedWalletAddress(fusionPlusOrder, req),
    );
    return data;
  }

  @Post('/submitOrder')
  async submitOrder(@Req() req: any, @Body() submitOrderDto: SubmitOrderDto) {
    assertWalletAddressMatches(
      submitOrderDto.order?.maker,
      getVerifiedWalletAddress(req),
      'order.maker',
    );
    const data = await this.inchService.submitFusionOrder(
      req.device,
      submitOrderDto,
    );
    return data;
  }

  @Post('/submitFusionPlusOrder')
  async submitFusionPlusOrder(
    @Req() req: any,
    @Body() submitOrderDto: SubmitOrderDto,
  ) {
    assertWalletAddressMatches(
      submitOrderDto.order?.maker,
      getVerifiedWalletAddress(req),
      'order.maker',
    );
    const data = await this.inchService.submitFusionPlusOrder(
      req.device,
      submitOrderDto,
    );
    return data;
  }

  @Get('/orderStatus')
  async orderStatus(@Query() inchOrderStatusDto: InchOrderStatusDto) {
    const data = await this.inchService.orderStatus(inchOrderStatusDto);
    return data;
  }

  @Delete('/cancelorder')
  async cancelOrder(@Body() cancelFusionOrderDto: CancelFusionOrderDto) {
    const data = await this.inchService.cancelOrder(cancelFusionOrderDto);
    return data;
  }

  @Post('/buildFusionPlusNativeOrder')
  async buildFusionPlusNativeOrder(
    @Req() req: any,
    @Body() body: FusionPlusSwapQuoteDto,
  ) {
    return await this.fustionNativeService.createSwapOrder(
      withVerifiedWalletAddress(body, req),
    );
  }

  @Post('/submitFusionPlusNativeOrder')
  async confirmOrder(@Body() confirmSwapOrderDto: ConfirmSwapOrderDto) {
    return this.fustionNativeService.confirmSwapOrder(confirmSwapOrderDto);
  }

  @Post('/customNotification')
  @UseGuards(CustomNotificationOriginGuard)
  @RateLimit(
    { points: 10, duration: 60, key: 'custom-notification-minute' },
    { points: 50, duration: 3600, key: 'custom-notification-hour' },
  )
  async customNotification(
    @Req() req: any,
    @Body() notification: NotificationDto,
  ) {
    return await this.inchService.fireCustomNotification(
      req.device,
      notification,
    );
  }
}
