import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { RangoService } from '../../swap/rango/rango.service';
import { InchService } from '../../swap/1inch/1inch.service';
import { swapProvider } from '../../common/enums/chain.enum';
import { plainToInstance } from 'class-transformer';
import { RangoRouteDto } from '../../swap/dto/rangoRoute';
import { validate, validateOrReject } from 'class-validator';
import { SwapProviderResolver } from './dto/swap-provider.resolver';

@Controller('api/v1/quoter')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))

export class QuoterController {
  constructor(
    private readonly quoterService: QuoterService,
    private readonly inchService: InchService,
    private readonly rangoService: RangoService,
    private readonly swapProviderResolver: SwapProviderResolver,
  ) { }
  private async handleValidationAndRun(
  dtoClass: any,
  payload: any,
  serviceMethod: (data: any) => Promise<any>,
) {
  const dto = plainToInstance(dtoClass, payload);

  const errors = await validate(dto);

  if (errors.length > 0) {
    const messages = this.extractErrors(errors);

    throw new BadRequestException(messages);
  }

  const result = await serviceMethod(dto);

  return {
    success: true,
    data: result,
  };
}

private extractErrors(errors: any[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      messages.push(...(Object.values(error.constraints) as string[]));
    }

    if (error.children?.length) {
      messages.push(...this.extractErrors(error.children));
    }
  }

  return messages;
}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getQuote(@Body() body: SwapQuoteDto) {
  const { provider, transformed } = this.swapProviderResolver.resolve(body);

   switch (provider) {
    case swapProvider.RANGO:
      return await this.handleValidationAndRun(
        RangoRouteDto,
        transformed,
        this.rangoService.bestRoute.bind(this.rangoService),
      );

    case swapProvider.UNISWAP:
      return await this.handleValidationAndRun(
        SwapQuoteDto,
        transformed,
        this.quoterService.getQuote.bind(this.quoterService),
      );

    case swapProvider.ONEINCH:
      return await this.handleValidationAndRun(
        SwapQuoteDto,
        transformed,
        this.inchService.getSwapQuote.bind(this.inchService),
      );

    default:
      throw new BadRequestException('Invalid provider');
  }
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Body() dto: SwapQuoteDto) {
    const quote = await this.quoterService.buildSwapTx(dto);
    return {
      success: true,
      data: quote,
    };
  }
}