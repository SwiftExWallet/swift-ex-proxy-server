import { Injectable, Logger } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { ChainId } from '../../common/enums/chain.enum';
import axios, { AxiosRequestConfig } from 'axios';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';

@Injectable()
export class InchService {
  private readonly logger = new Logger(InchService.name);
  constructor() {}
  async getSwapQuote(swapQuote: SwapQuoteDto) {
    const { tokenIn, tokenOut, amount, walletAddress, chain } = swapQuote;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {
        walletAddress,
        amount,
        toTokenAddress: tokenOut,
        fromTokenAddress: tokenIn,
        enableEstimate: true,
      },
      paramsSerializer: {
        indexes: null,
      },
    };

    try {
      const response = await axios.get(url, config);
      const data = response.data;
      return data;
      //   return {
      //     fromToken: {
      //       address: data.fromToken.address,
      //       symbol: data.fromToken.symbol,
      //       decimals: data.fromToken.decimals,
      //     },
      //     toToken: {
      //       address: data.toToken.address,
      //       symbol: data.toToken.symbol,
      //       decimals: data.toToken.decimals,
      //     },
      //     fromAmount: data.fromTokenAmount, // amount you're swapping
      //     toAmount: data.toTokenAmount, // estimated amount you'll receive
      //     quoteId: data.quoteId, // needed to place order later
      //     recommendedPreset: data.recommendedPreset, // fast | medium | slow
      //     presets: data.presets, // auction settings per preset
      //     prices: data.prices, // token prices
      //     volume: data.volume, // swap volume in USD
      //   };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async buildFusionOrder(fusionOrder: FusionOrderDto) {
    const { quote, tokenIn, tokenOut, amount, walletAddress, chain } =
      fusionOrder;

    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {
        fee: 0,
        isPermit2: false,
        additionalAuctionStartDelay: 30,
        walletAddress,
        amount,
        toTokenAddress: tokenOut,
        fromTokenAddress: tokenIn,
      },
      paramsSerializer: {
        indexes: null,
      },
    };

    const response = await axios.post(
      `${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/build`,
      quote,
      config,
    );

    return response.data; // returns order struct + typedData for signing
  }

  async submitOrder(submitOrderDto: SubmitOrderDto) {
    const { order, signature, extension, quoteId, chain } = submitOrderDto;
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {},
      paramsSerializer: {
        indexes: null,
      },
    };
    const body = {
      order,
      signature,
      quoteId,
      extension,
    };
    const response = await axios.post(
      `${process.env.QUOTER_BASE}/${ChainId[chain]}/order/submit`,
      body,
      config,
    );

    return response.data; // { orderHash: '0x...' }
  }
}
