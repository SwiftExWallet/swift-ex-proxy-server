import { BadRequestException, Injectable } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SwapQuoteDto } from "src/api/v1/common/dto/swapQuote.dto";
import { ChainIdToRango, swapProvider } from "src/api/v1/common/enums/chain.enum";
import { InchService } from "../../../swap/1inch/1inch.service";
import { RangoRouteDto } from "../../../swap/dto/rangoRoute";
import { RangoService } from "../../../swap/rango/rango.service";
import { QuoterService } from "../quoter.service";

interface ProviderRule {
  provider: swapProvider;
  matches: (data: SwapQuoteDto) => boolean;
}

@Injectable()
export class SwapProviderResolver {

  constructor(
    private readonly rangoService: RangoService,
    private readonly quoterService: QuoterService,
    private readonly inchService: InchService,
  ) { }

  private readonly rules: ProviderRule[] = [
    {
      provider: swapProvider.RANGO,
      matches: (data) =>
        String(data.tokenIn?.chainId) !== String(data.tokenOut?.chainId),
    },
    {
      provider: swapProvider.UNISWAP,
      matches: (data) =>
        String(data.tokenIn?.chainId) === String(data.tokenOut?.chainId),
    },
  ];

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

  async getQuoteByProvider(swapQuote: SwapQuoteDto,) {
    const { provider, transformed } = this.resolve(swapQuote);

    switch (provider) {
      case swapProvider.RANGO:
        return await this.handleValidationAndRun(
          RangoRouteDto,
          transformed,
          this.rangoService.bestRoute.bind(this.rangoService),
          provider
        );

      case swapProvider.UNISWAP:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.quoterService.getQuote.bind(this.quoterService),
          provider
        );

      case swapProvider.ONEINCH_FUSION:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.inchService.getSwapQuote.bind(this.inchService),
          provider
        );

      default:
        throw new BadRequestException('Invalid provider');
    }
  }

  resolve(data: SwapQuoteDto): { provider: swapProvider; transformed: any } {
    const provider = this.resolveProvider(data);
    const transformed = this.transform(provider, data);
    return { provider, transformed };
  }

  private resolveProvider(data: SwapQuoteDto): swapProvider {
    for (const rule of this.rules) {
      if (rule.matches(data)) return rule.provider;
    }
    throw new BadRequestException('No matching provider found');
  }

  private transform(provider: swapProvider, data: SwapQuoteDto): any {
    switch (provider) {
      case swapProvider.RANGO:
        return {
          from: {
            blockchain: ChainIdToRango[data.tokenIn.chainId],
            symbol: data.tokenIn.symbol,
            address: data.tokenIn.address,
          },
          to: {
            blockchain: ChainIdToRango[data.tokenOut.chainId],
            symbol: data.tokenOut.symbol,
            address: data.tokenOut.address,
          },
          amount: data.amount,
        };

      case swapProvider.UNISWAP:
      case swapProvider.ONEINCH_FUSION:
        return data;
    }
  }
}