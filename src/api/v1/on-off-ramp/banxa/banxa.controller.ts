import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { BanxaService } from './banxa.service';
import { Response } from 'express';
import { AssetsDto, BanxaQuotesDto } from './dto/banxa-quotes.dto';
import { CreateOrderDto } from './dto/banxa-create-order.dto';
import { BanxaWebhookService } from './banxaWebhook.service';
import { UserQueueService } from '../../common/user-queue/user-queue.service';

@Controller('api/v1/banxa/')
export class BanxaController {
  private readonly logger = new Logger(BanxaController.name);
  constructor(
    private readonly banxaService: BanxaService,
    private userQueueService: UserQueueService,
    private readonly banxaWebhookService: BanxaWebhookService,
  ) {}

  @Get('fetch-assets')
  async getAssets(@Query() payload: AssetsDto) {
    return this.banxaService.fetchAssets(payload);
  }

  @Post('fetch-quotes')
  async fetchQuotes(
    @Res() response: Response,
    @Body() quotesDto: BanxaQuotesDto,
  ) {
    return this.userQueueService.processUserRequest(async () => {
      this.logger.log('banxa-fetch-quotes');
      const quotesRes = await this.banxaService.fetchQuotes(quotesDto);
      response.send({ success: quotesRes.status, data: quotesRes.data });
    });
  }

  @Post('create-buy-order')
  async createBuyOrder(
    @Req() req: any,
    @Res() response: Response,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    const quotesRes = await this.banxaService.buyOrderCreate(
      createOrderDto,
      req.device,
    );
    response.send({ success: quotesRes });
  }

  @Post('create-sell-order')
  async createSellOrder(
    @Req() req: any,
    @Res() response: Response,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    const quotesRes = await this.banxaService.sellOrderCreate(
      createOrderDto,
      req.device,
    );
    response.send({ success: quotesRes });
  }
}
