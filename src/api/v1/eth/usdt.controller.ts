import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { EthService } from './eth.service';
import { UsdtSwapQuoteDto } from './dto/usdtSwapQuote.dto';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

@Controller('api/v1/usdt')
export class UsdtController {
  constructor(private readonly ethService: EthService) {}

  @Post('swap-transaction/prepare')
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'usdt-swap-transaction-prepare')
  async swapPrepare(
    @Req() req: any,
    @Res() res,
    @Body() usdtSwapQuoteDto: UsdtSwapQuoteDto,
  ) {
    const data = await this.ethService.prepareUsdtSwapTransaction(
      usdtSwapQuoteDto,
      req.wallet?.address,
    );
    res.status(200).json(data);
  }
}
