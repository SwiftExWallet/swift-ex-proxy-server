import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { InchService } from './1inch.service';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import {
  RateLimit,
  rateLimitByIpAndDevice,
  rateLimitByIpDeviceAndWallet,
} from '../../common/decorators/rate-limit.decorator';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import { ConfirmSwapOrderDto } from '../dto/prepareTxDto';
import { NotificationDto } from '../../notification/dto/notification.dto';
import { CustomNotificationOriginGuard } from '../../common/guard/custom-notification-origin.guard';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
  withVerifiedWalletAddress,
} from '../../common/helpers/requestWallet';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../../common/decorators/body-size-limit.decorator';

@Controller('api/v1/swap/1inch')
export class inchController {
  constructor(
    private readonly inchService: InchService,
    private readonly fustionNativeService: FustionNativeService,
  ) {}

  @Post('/getSwapQuote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'inch-swap-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-swap-quote', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async getQuote(@Req() req: any, @Body() swapQuote: SwapQuoteDto) {
    const data = await this.inchService.getSwapQuote(
      withVerifiedWalletAddress(swapQuote, req),
    );
    return data;
  }

  @Post('/fusion-plus/getSwapQuote')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'inch-fusion-plus-quote')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-fusion-plus-quote', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
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
  @BodySizeLimit(
    BODY_SIZE_LIMITS.providerOrderPayload,
    'inch-build-fusion-order',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-build-fusion-order', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
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
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'inch-build-fusion-plus-order')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-build-fusion-plus-order', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
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
  @BodySizeLimit(BODY_SIZE_LIMITS.providerOrderPayload, 'inch-submit-order')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-submit-order', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
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
  @BodySizeLimit(
    BODY_SIZE_LIMITS.providerOrderPayload,
    'inch-submit-fusion-plus-order',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-submit-fusion-plus-order', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
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
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-order-status', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async orderStatus(@Query() inchOrderStatusDto: InchOrderStatusDto) {
    const data = await this.inchService.orderStatus(inchOrderStatusDto);
    return data;
  }

  @Post('/buildFusionPlusNativeOrder')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.providerOrderPayload,
    'inch-build-fusion-plus-native-order',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-build-fusion-plus-native-order', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async buildFusionPlusNativeOrder(
    @Req() req: any,
    @Body() body: FusionPlusSwapQuoteDto,
  ) {
    return await this.fustionNativeService.createSwapOrder(
      withVerifiedWalletAddress(body, req),
    );
  }

  @Post('/submitFusionPlusNativeOrder')
  @BodySizeLimit(
    BODY_SIZE_LIMITS.simple,
    'inch-submit-fusion-plus-native-order',
  )
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('inch-submit-fusion-plus-native-order', {
      ip: 20,
      device: 10,
      wallet: 10,
    }),
  )
  async confirmOrder(@Body() confirmSwapOrderDto: ConfirmSwapOrderDto) {
    return this.fustionNativeService.confirmSwapOrder(confirmSwapOrderDto);
  }

  @Post('/customNotification')
  @UseGuards(CustomNotificationOriginGuard)
  @BodySizeLimit(BODY_SIZE_LIMITS.notification, 'custom-notification')
  @RateLimit(
    ...rateLimitByIpAndDevice('custom-notification-minute', {
      ip: 10,
      device: 10,
    }),
    ...rateLimitByIpAndDevice(
      'custom-notification-hour',
      {
        ip: 50,
        device: 50,
      },
      3600,
    ),
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
