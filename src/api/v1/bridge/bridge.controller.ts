import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { AllBridgeSwapADto } from './all-bridge/dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './all-bridge/dto/all-bridge-swap-quotes.dto';
import { AllBridgeService } from './all-bridge/all-bridge.service';
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

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly allBridgeService: AllBridgeService) {}

  @Post('swap-transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'bridge-swap-transaction-prepare')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('bridge-swap-transaction-prepare', {
      ip: 30,
      device: 15,
      wallet: 15,
    }),
  )
  async getSwapQuote(
    @Req() req: any,
    @Res() res,
    @Body() allBridgeSwapADto: AllBridgeSwapADto,
  ) {
    const response = await this.allBridgeService.prepareTransaction(
      withVerifiedWalletAddress(allBridgeSwapADto, req, 'fromAddress'),
    );
    res.status(200).json(response);
  }

  @Post('swap-quotes')
  @BodySizeLimit(BODY_SIZE_LIMITS.simple, 'bridge-swap-quotes')
  @RateLimit(
    ...rateLimitByIpAndDevice('bridge-swap-quotes', {
      ip: 60,
      device: 30,
    }),
  )
  async getSwapDetails(
    @Res() res,
    @Body() allBridgeQuotes: AllBridgeQuotesDto,
  ) {
    const quotes = await this.allBridgeService.getSwapDetails(allBridgeQuotes);
    res.status(200).json(quotes);
  }
}
