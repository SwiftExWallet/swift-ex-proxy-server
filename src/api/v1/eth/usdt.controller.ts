import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { EthService } from './eth.service';
import { UsdtSwapQuoteDto } from './dto/usdtSwapQuote.dto';
import { withVerifiedWalletAddress } from '../common/helpers/requestWallet';

@Controller('api/v1/usdt')
export class UsdtController {
  constructor(private readonly ethService: EthService) {}

  @Post('swap-transaction/prepare')
  async swapPrepare(
    @Req() req: any,
    @Res() res,
    @Body() usdtSwapQuoteDto: UsdtSwapQuoteDto,
  ) {
    const data = await this.ethService.prepareUsdtSwapTransaction(
      withVerifiedWalletAddress(usdtSwapQuoteDto, req, 'fromAddress'),
    );
    res.status(200).json(data);
  }
}
