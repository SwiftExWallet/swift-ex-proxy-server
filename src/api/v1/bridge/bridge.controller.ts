import { Body, Controller, Post, Res } from '@nestjs/common';
import { AllBridgeService } from './all-bridge/all-bridge.service';
import { AllBridgeSwapADto } from './all-bridge/dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './all-bridge/dto/all-bridge-swap-quotes.dto';

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly allBridgeService: AllBridgeService) {}

  @Post('swap-transaction/prepare')
  async getSwapQuote(@Res() res, @Body() allBridgeSwapADto: AllBridgeSwapADto) {
    const { transaction,txMeta, type } =
      await this.allBridgeService.prepareTransaction(allBridgeSwapADto);
    res.status(200).json({ transaction,txMeta, type });
  }

  @Post('swap-quotes')
  async getSwapDetails(
    @Res() res,
    @Body() allBridgeQuotes: AllBridgeQuotesDto,
  ) {
    const quotes = await this.allBridgeService.getSwapDetails(allBridgeQuotes);
    res.status(200).json({ quotes });
  }
}
