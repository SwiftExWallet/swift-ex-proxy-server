import { Body, Controller, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from './dto/swapQuote.dto';
import { EthService } from './eth.service';

@Controller('/api/v1/eth')
export class EthController {
  constructor(private readonly ethService: EthService) {}
  @Post('getSwapQuote')
  async getSwapQuote(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json({
      success: true,
      data,
    });
  }
}
