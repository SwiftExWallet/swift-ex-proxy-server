import { Body, Controller, Post, Res } from '@nestjs/common';
import { AllBridgeService } from './all-bridge/all-bridge.service';
import { AllBridgeSwapADto } from './all-bridge/dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './all-bridge/dto/all-bridge-swap-quotes.dto';
import { AllBridgeBscService } from './all-bridge/all-bridge.bsc.service';

@Controller('api/v1/bridge')
export class BridgeController {
  constructor(private readonly allBridgeService: AllBridgeService,
    private readonly allBridgeBscService: AllBridgeBscService
  ) { }

  @Post('swap-transaction/prepare')
  async getSwapQuote(@Res() res, @Body() allBridgeSwapADto: AllBridgeSwapADto) {
    if (allBridgeSwapADto.walletType === "ETH") {
      const response = await this.allBridgeService.prepareTransaction(allBridgeSwapADto);
      res.status(200).json(response);
    }
    if(allBridgeSwapADto.walletType==="BNB"){
      const { transaction,txMeta, type } =
      await this.allBridgeBscService.prepareTransaction(allBridgeSwapADto);
      res.status(200).json({ transaction,txMeta, type });
    }
  }

  @Post('swap-quotes')
  async getSwapDetails(
    @Res() res,
    @Body() allBridgeQuotes: AllBridgeQuotesDto,
  ) {
    if(allBridgeQuotes.chainType==="BNB"){
      const quotes = await this.allBridgeBscService.getSwapDetails(allBridgeQuotes);
      res.status(200).json({ quotes });
    }
    if(allBridgeQuotes.chainType==="ETH"){
      const quotes = await this.allBridgeService.getSwapDetails(allBridgeQuotes);
      res.status(200).json({ quotes });
    }
  }
}
