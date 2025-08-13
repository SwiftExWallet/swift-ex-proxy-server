import { Body, Controller, Post, Res } from '@nestjs/common';
import { AllBridgeService } from './all-bridge/all-bridge.service';
import { AllBridgeSwapADto } from './all-bridge/dto/all-bridge-swap.dto';
import { AllbridgeQuotesDto } from './all-bridge/dto/all-bridge-swap-quotes.dto';

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly allBridgeService: AllBridgeService) {}
  @Post('swap-transaction/prepare')
  async getSwapQuote(@Res() res, @Body() allBridgeSwapADto: AllBridgeSwapADto) {
    const rawTransaction =
      await this.allBridgeService.prepareTransaction(allBridgeSwapADto);
    res.status(200).json({ rawTransaction });
  }
  @Post('swap-quotes')
    async getSwapDetails(@Body() allbridgeQuotes:AllbridgeQuotesDto) {
      return this.allBridgeService.getSwapDetails(allbridgeQuotes);
    }
}
