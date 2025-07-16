import { Body, Controller, Post, Res } from '@nestjs/common';
import { SwapQuoteDto } from './dto/swapQuote.dto';
import { EthService } from './eth.service';
import { WalletAddressInfoDto } from './dto/walletAddressInfo.dto';
import { BroadcastTransactionDto } from './dto/broadcastTransactionDto';

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

  @Post('walletAddress/info')
  async getAddressInfo(
    @Res() res,
    @Body() walletAddressInfoDto: WalletAddressInfoDto,
  ) {
    const data =
      await this.ethService.getWalletAddressInfo(walletAddressInfoDto);
    res.status(200).json({
      success: true,
      data,
    });
  }

  @Post('broadcast')
  async broadcastTransaction(
    @Res() res,
    @Body() broadcastTransactionDto: BroadcastTransactionDto,
  ) {
    const data = await this.ethService.broadcastTransaction(
      broadcastTransactionDto,
    );
    res.status(200).json({
      success: true,
      data,
    });
  }

  @Post('swapPrepare')
  async swapPrepare(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json({
      success: true,
      data,
    });
  }

  @Post('swapExecute')
  async swapExecute(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json({
      success: true,
      data,
    });
  }

  @Post('fetchTokenInfo')
  async fetchTokenInfo(@Res() res, @Body() swapQuoteDto: SwapQuoteDto) {
    const data = await this.ethService.getSwapQuote(swapQuoteDto);
    res.status(200).json({
      success: true,
      data,
    });
  }
}
