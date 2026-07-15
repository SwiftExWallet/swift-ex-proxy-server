import {
  Controller,
  HttpCode,
  HttpStatus,
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
import { validate } from 'class-validator';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { TokenMetadataService } from '../../common/services/tokenMetadata.service';

@Controller('api/v1/quoter')
export class QuoterController {
  constructor(
    private readonly quoterService: QuoterService,
    private readonly inchService: InchService,
    private readonly rangoService: RangoService,
    private readonly swapProviderResolver: SwapProviderResolver,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {}
  private async handleValidationAndRun(
    dtoClass: any,
    payload: any,
    serviceMethod: (data: any) => Promise<any>,
    typeOfProvider: any,
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
      provider: typeOfProvider,
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
    const normalizedBody =
      await this.tokenMetadataService.normalizeSwapQuote(body);
    const { provider, transformed } =
      this.swapProviderResolver.resolve(normalizedBody);

    switch (provider) {
      case swapProvider.RANGO:
        return await this.handleValidationAndRun(
          RangoRouteDto,
          transformed,
          this.rangoService.bestRoute.bind(this.rangoService),
          provider,
        );

      case swapProvider.UNISWAP:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.quoterService.getQuote.bind(this.quoterService),
          provider,
        );

      case swapProvider.ONEINCH_FUSION:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.inchService.getSwapQuote.bind(this.inchService),
          provider,
        );

      default:
        throw new BadRequestException('Invalid provider');
    }
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swapBuild(@Body() dto: SwapQuoteDto) {
    const normalizedDto = await this.tokenMetadataService.normalizeSwapQuote(dto);
    const quote = await this.quoterService.buildSwapTx(normalizedDto);
    return {
      success: true,
      data: quote,
    };
  }
}
