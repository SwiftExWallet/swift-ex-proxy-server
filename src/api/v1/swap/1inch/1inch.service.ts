import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { ChainId, swapProvider } from '../../common/enums/chain.enum';
import { SwapOrderStatus as OrderStatus } from '../../common/enums/order.enum';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import axios, { AxiosRequestConfig } from 'axios';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { HashLock, } from '@1inch/cross-chain-sdk';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { InchWsPollerService } from './inchWsPoller.service';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';
import { InchFusionPlusWsPollerService } from './inchFusionPlusWsPoller.service';

@Injectable()
export class InchService {
  private readonly logger = new Logger(InchService.name);
  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly inchWsPollerService: InchWsPollerService,
    private readonly inchFusionPlusWsPollerService: InchFusionPlusWsPollerService,
  ) { }
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
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
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
        srcChain: ChainId[srcChain],
        dstChain: ChainId[dstChain],
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
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
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

  async buildFusionPlusOrder(fusionPlusOrder: FusionPlusOrderDto) {
    const { quoteId, walletAddress, secretCount } = fusionPlusOrder;
    const { secretHashes } = this.generateSecrets(secretCount, quoteId);

    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {
        quoteId,
      },
      paramsSerializer: {
        indexes: null,
      },
    };

    const body = {
      fee: 0,
      secretsHashList: secretHashes,
      isPermit2: true,
      preset: 'fast',
      walletAddress,
    };

    const response = await axios.post(
      `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/build/evm`,
      body,
      config,
    );

    return response.data; // returns order struct + typedData for signing
  }


  async submitFusionOrder(device: any, submitOrderDto: SubmitOrderDto) {
    try {
      const { order, signature, extension, quoteId, chain, orderHash } = submitOrderDto;
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
      await axios.post(
        `${process.env.INCH_RELAYER_BASE}/${ChainId[chain]}/order/submit`,
        body,
        config,
      );

      await this.swapOrderService.store(device, {
        quoteId,
        txHash: orderHash,
        provider: swapProvider.ONEINCH_FUSION,
        walletAddress: order.maker,
        fromChain: chain,
        toChain: chain,
        fromToken: order.makerAsset,
        toToken: order.takerAsset,
        amountIn: order.makingAmount,
        amountOut: order.takingAmount,
        status: OrderStatus.PENDING,
        deviceFcmToken: device.fcmToken,
        deviceId: device._id
      });

      this.inchWsPollerService.subscribeOrder(orderHash, ChainId[chain] as any, quoteId);

      return { success: true }
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  async submitFusionPlusOrder(device: any, submitOrderDto: SubmitOrderDto) {
    try {
      const { order, signature, extension, quoteId, chain, toChain, orderHash } = submitOrderDto;
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

      await this.swapOrderService.store(device, {
        quoteId,
        txHash: orderHash,
        provider: swapProvider.ONEINCH_FUSION_PLUS,
        walletAddress: order.maker,
        fromChain: chain,
        toChain: toChain || chain,
        fromToken: order.makerAsset,
        toToken: order.takerAsset,
        amountIn: order.makingAmount,
        amountOut: order.takingAmount,
        status: OrderStatus.PENDING,
        deviceFcmToken: device.fcmToken,
        deviceId: device._id
      });
      await axios.post(
        `${process.env.FUSION_PLUS_RELAYER_BASE}/submit`,
        body,
        config,
      );
      this.inchFusionPlusWsPollerService.subscribeOrder(orderHash, quoteId);

      return { success: true }
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  async cancelOrder(cancelFusionOrderDto: CancelFusionOrderDto) {
    const { chain, orderHash } = cancelFusionOrderDto;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/order/cancel`;

    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {
      },
      paramsSerializer: {
        indexes: null,
      },
    };
    const response = await axios.post(
      url,
      { orderHash },
      config,
    );
    return response.data;
  }

  generateSecrets(secretsCount: number, quoteId: string) {

    // Hash each secret
    const secretHashes = Array.from({ length: secretsCount }, (_, index) =>
      HashLock.hashSecret(this.inchFusionPlusWsPollerService.createSecretForQuoteId(quoteId, index))
    );

    // Build hashlock from secrets
    // const hashLock =
    //   secretsCount === 1
    //     ? HashLock.forSingleFill(secrets[0]) // single fill
    //     : HashLock.forMultipleFills(secretHashes as MerkleLeaf[]); // multiple fills (Merkle tree)

    return { secretHashes };
  }

  async orderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    const url = `${process.env.INCH_ORDER_BASE}/${ChainId[inchOrderStatusDto.chain]}/order/status/${inchOrderStatusDto.orderHash}`;
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      },
      params: {},
      paramsSerializer: {
        indexes: null,
      },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get order status';
      throw new BadRequestException(message);
    }
  }
}
