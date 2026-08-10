import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { Response } from 'express';
import { AlchemyQuotesDto } from './dto/alchemy-quotes-order.dto';
import { CreateBuyOrderDto } from './dto/alchemy-create-order.dto';
import { SellOrderDto } from './dto/alchemy-sell-order.dto';
import { UserQueueService } from '../../common/user-queue/user-queue.service';

@Controller('api/v1/alchemy/')
export class AlchemyController {
  constructor(
    private readonly alchemyService: AlchemyService,
    private userQueueService: UserQueueService,
  ) {}

  @Post('fetch-quotes')
  async fetchQuotes(
    @Res() response: Response,
    @Body() quotesDto: AlchemyQuotesDto,
  ) {
    return this.userQueueService.processUserRequest(async () => {
      console.log('Processing user ');
      const quotesRes = await this.alchemyService.fetchQuotes(quotesDto);
      response.send({ success: quotesRes.status, data: quotesRes.data });
    });
  }

  @Post('create-buy-order')
  createBuyOrder(
    @Req() req: any,
    @Res() response: Response,
    @Body() createBuyOrderDto: CreateBuyOrderDto,
  ) {
    const quotesRes = this.alchemyService.orderCreate(createBuyOrderDto);
    response.send({ success: quotesRes });
  }

  @Post('create-sell-order')
  createSellOrder(
    @Req() req: any,
    @Res() response: Response,
    @Body() sellOrderDto: SellOrderDto,
  ) {
    const quotesRes = this.alchemyService.sellOrderCreate(sellOrderDto);
    response.send({ success: quotesRes });
  }
}
