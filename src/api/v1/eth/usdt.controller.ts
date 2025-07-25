import { Body, Controller, Post, Res } from '@nestjs/common';
import { EthService } from './eth.service';
import { UsdtSwapQuoteDto } from './dto/usdtSwapQuote.dto';

@Controller('api/v1/usdt')
export class UsdtController {
  constructor(private readonly ethService: EthService) {}

  @Post('swap-transaction/prepare')
  async swapPrepare(@Res() res, @Body() usdtSwapQuoteDto: UsdtSwapQuoteDto) {
    const data =
      await this.ethService.prepareUsdtSwapTransaction(usdtSwapQuoteDto);
    res.status(200).json(data);
  }
}
