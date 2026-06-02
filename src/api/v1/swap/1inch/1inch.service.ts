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
import { ethers } from 'ethers';
import { HashLock,  } from '@1inch/cross-chain-sdk';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { encryptFusionSecrets } from '../../common/utils/encryption.util';
import { RedisService } from '../../redis/redis.service';
import { InchWsPollerService } from '../../crons/inchWsPoller.service';
import * as crypto from 'crypto';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';

@Injectable()
export class InchService {
  private readonly logger = new Logger(InchService.name);
  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly inchWsPollerService: InchWsPollerService,
  ) {}
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
    try{
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
      receiver:walletAddress
    };

    const response = await axios.post(
      `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/build/evm`,
      body,
      config,
    );

    return response.data; // returns order struct + typedData for signing
    } catch (error) {
      this.logger.error(error);
       const message =
        error.response.data.description ||
        error.response.data ||
        'unable to build swap';
      throw new BadRequestException(message);
    }
  }


  async submitFusionOrder(device: any, submitOrderDto: SubmitOrderDto) {
    try {
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
        `${process.env.INCH_RELAYER_BASE}/${ChainId[chain]}/order/submit`,
        body,
        config,
      );

      return response.data; // { orderHash: '0x...' }
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
      const { order, signature, extension, quoteId, chain, toChain } = submitOrderDto;
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
        srcChainId:ChainId[chain],
        signature,
        quoteId,
        extension,
      };
      const response = await axios.post(
        `${process.env.FUSION_PLUS_RELAYER_BASE}/submit`,
        body,
        config,
      );
      
      let encryptedFusionSecrets: string | undefined;
      const rawSecretsStr = await this.redisService.getKey(`fusion_secrets:${quoteId}`);
      if (rawSecretsStr) {
        try {
          const rawSecrets = JSON.parse(rawSecretsStr);
          encryptedFusionSecrets = encryptFusionSecrets(rawSecrets);
          await this.redisService.delKey(`fusion_secrets:${quoteId}`);
        } catch (err) {
          this.logger.error('Failed to encrypt fusion secrets', err);
        }
      }
      return response.data; // { orderHash: '0x...' }
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
      { orderHash},
      config,
    );
    return response.data;
  }
  generateSecrets(secretsCount: number, quoteId: string) {

    // Hash each secret
    const secretHashes = Array.from({ length: secretsCount }, (_, index) =>
      HashLock.hashSecret(this.createSecretForQuoteId(quoteId, index))
    );

    // Build hashlock from secrets
    // const hashLock =
    //   secretsCount === 1
    //     ? HashLock.forSingleFill(secrets[0]) // single fill
    //     : HashLock.forMultipleFills(secretHashes as MerkleLeaf[]); // multiple fills (Merkle tree)

    return {  secretHashes };
  }

  createSecretForQuoteId(quoteId: string, index: number) {
    const secret = crypto
    .createHmac("sha256", process.env.MASTER_HASH_KEY as string)
    .update(`${index}-${quoteId}`)
    .digest();
    return ethers.hexlify(secret);
  }

  async orderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    if(inchOrderStatusDto.swapProvider===swapProvider["ONEINCH_FUSION_PLUS"]){
      return await this.fusionPlusOrderStatus(inchOrderStatusDto);
    }
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

  async fusionPlusOrderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    const url = `${process.env.FUSION_PLUS_ORDER_BASE}${inchOrderStatusDto.orderHash}`;
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
