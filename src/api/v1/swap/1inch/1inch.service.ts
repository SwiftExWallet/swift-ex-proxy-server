import { Injectable, Logger } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { ChainId } from '../../common/enums/chain.enum';
import axios, { AxiosRequestConfig } from 'axios';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';

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
        isPermit2: true,
      },
      paramsSerializer: {
        indexes: null,
      },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getFusionPlusSwapQuote(fusionPlusSwapQuote: FusionPlusSwapQuoteDto) {
    const {
      srcChain,
      dstChain,
      srcTokenAddress,
      dstTokenAddress,
      amount,
      walletAddress,
    } = fusionPlusSwapQuote;
    const url = `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {
        walletAddress,
        amount,
        srcChain,
        dstChain,
        srcTokenAddress,
        dstTokenAddress,
        enableEstimate: true,
        isPermit2: true,
      },
      paramsSerializer: {
        indexes: null,
      },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
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
