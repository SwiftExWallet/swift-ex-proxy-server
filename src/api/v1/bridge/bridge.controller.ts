import { Body, Controller, Post, Res } from '@nestjs/common';
import { AllBridgeSwapDto } from './all-bridge/dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './all-bridge/dto/all-bridge-swap-quotes.dto';
import { AllBridgeService } from './all-bridge/all-bridge.service';

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly allBridgeService: AllBridgeService) {}

  @Post('swap-transaction/prepare')
  async getSwapQuote(@Res() res, @Body() AllBridgeSwapDto: AllBridgeSwapDto) {
    const response =
      await this.allBridgeService.prepareTransaction(AllBridgeSwapDto);
    res.status(200).json(response);
  }

  @Post('swap-quotes')
  async getSwapDetails(
    @Res() res,
    @Body() allBridgeQuotes: AllBridgeQuotesDto,
  ) {
    const quotes = await this.allBridgeService.getSwapDetails(allBridgeQuotes);
    res.status(200).json(quotes);
  }
}
