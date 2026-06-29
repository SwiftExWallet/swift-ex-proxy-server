import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { ChainId, swapProvider } from '../../common/enums/chain.enum';
import { SwapOrderStatus as OrderStatus, SwapOrderStatus } from '../../common/enums/order.enum';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import axios, { AxiosRequestConfig } from 'axios';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { ethers } from 'ethers';
import { HashLock, MerkleLeaf, SDK, OrderStatus as SDKOrderStatus } from '@1inch/cross-chain-sdk';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { encryptFusionSecrets } from '../../common/utils/encryption.util';
import { RedisService } from '../../redis/redis.service';
import { InchWsPollerService } from '../1inch/inchWsPoller.service';
import * as crypto from 'crypto';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { NotificationDto } from '../../notification/dto/notification.dto';

interface RedisOrderSecretState {
  secrets: string[];
  secretHashes: string[];
  hashLock: any;
  submittedIdx: number[];
}

@Injectable()
export class InchService {
  private readonly logger = new Logger(InchService.name);
  private readonly sdk: SDK;

  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly inchWsPollerService: InchWsPollerService,
    private readonly firebaseNotificationService:FirebaseNotificationService
  ) {
    this.sdk = new SDK({
      url: 'https://api.1inch.com/fusion-plus',
      authKey: process.env.INCH_API_KEY,
    });
  }
  
  private async getSecretState(key: string): Promise<{ secrets: string[]; secretHashes: string[]; hashLock: any; submittedIdx: Set<number> } | null> {
    const rawStr = await this.redisService.getKey(`fusion_secrets:${key}`);
    if (!rawStr) return null;
    try {
      const parsed = JSON.parse(rawStr) as RedisOrderSecretState;
      return {
        ...parsed,
        submittedIdx: new Set(parsed.submittedIdx || []),
      };
    } catch (err) {
      this.logger.error(`Failed to parse secret state for key: ${key}`, err);
      return null;
    }
  }

  private async setSecretState(key: string, state: any): Promise<void> {
    const dataToSave: RedisOrderSecretState = {
      secrets: state.secrets,
      secretHashes: state.secretHashes,
      hashLock: state.hashLock,
      submittedIdx: Array.from(state.submittedIdx),
    };
    await this.redisService.setKey(`fusion_secrets:${key}`, JSON.stringify(dataToSave));
  }

  private async delSecretState(key: string): Promise<void> {
    await this.redisService.delKey(`fusion_secrets:${key}`);
  }

  async getSwapQuote(swapQuote: SwapQuoteDto) {
    const { tokenIn, tokenOut, amount, walletAddress, chain } = swapQuote;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: { walletAddress, amount, toTokenAddress: tokenOut, fromTokenAddress: tokenIn, enableEstimate: true, isPermit2: true },
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
       const message = error.response?.data?.description || error.response?.data || 'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async getFusionPlusSwapQuote(fusionPlusSwapQuote: FusionPlusSwapQuoteDto) {
    const { srcChain, dstChain, srcTokenAddress, dstTokenAddress, amount, walletAddress } = fusionPlusSwapQuote;
    const url = `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: { walletAddress, amount, srcChain: ChainId[srcChain], dstChain: ChainId[dstChain], srcTokenAddress, dstTokenAddress, enableEstimate: true, isPermit2: true },
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
       const message = error.response?.data?.description || error.response?.data || 'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async buildFusionOrder(fusionOrder: FusionOrderDto) {
    const { quote, tokenIn, tokenOut, amount, walletAddress, chain } = fusionOrder;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: { fee: 0, isPermit2: false, additionalAuctionStartDelay: 30, walletAddress, amount, toTokenAddress: tokenOut, fromTokenAddress: tokenIn },
      paramsSerializer: { indexes: null },
    };
    const response = await axios.post(`${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/build`, quote, config);
    return response.data;
  }

  async buildFusionPlusOrder(fusionPlusOrder: FusionPlusOrderDto) {
    try {
      const { quoteId, walletAddress, secretCount } = fusionPlusOrder;
      const { secrets, secretHashes, hashLock } = this.generateSecrets(secretCount);

      await this.setSecretState(`quote:${quoteId}`, {
        secrets,
        secretHashes,
        hashLock,
        submittedIdx: new Set(),
      });

      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: { quoteId },
        paramsSerializer: { indexes: null },
      };

      const body = {
        fee: 0,
        secretsHashList: secretHashes,
        preset: 'fast',
        walletAddress,
        hashLock,
        source: "APP",
      };

      const response = await axios.post(
        `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/build/evm`,
        body,
        config,
      );

      return response.data;
    } catch (error) {
      await this.delSecretState(`quote:${fusionPlusOrder.quoteId}`);
      this.logger.error(error);
       const message = error.response?.data?.description || error.response?.data || 'unable to build swap';
      throw new BadRequestException(message);
    }
  }

  async submitFusionOrder(device: any, submitOrderDto: SubmitOrderDto) {
    try {
      const { order, signature, extension, quoteId, chain } = submitOrderDto;
      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: {},
        paramsSerializer: { indexes: null },
      };
      const body = { order, signature, quoteId, extension };
      const response = await axios.post(`${process.env.INCH_RELAYER_BASE}/${ChainId[chain]}/order/submit`, body, config);
      return response.data;
    } catch (error: any) {
      this.logger.error(error);
      const message = error.response?.data?.description || error.response?.data || 'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  async submitFusionPlusOrder(device: any, submitOrderDto: SubmitOrderDto) {
    const { order, signature, extension, quoteId, chain, orderHash } = submitOrderDto;
    const tempKey = `quote:${quoteId}`;

    const secretState = await this.getSecretState(tempKey);
    if (!secretState) {
      throw new BadRequestException(`Secrets not found for quoteId "${quoteId}". Call buildFusionPlusOrder first.`);
    }

    try {
      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: {},
        paramsSerializer: { indexes: null },
      };
      const body = { order, srcChainId: ChainId[chain], signature, quoteId, extension };
      
      const response = await axios.post(`${process.env.FUSION_PLUS_RELAYER_BASE}/submit`, body, config);
      
      await this.delSecretState(tempKey);
      await this.setSecretState(orderHash, secretState);

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

      this.startSecretRevealPoller(orderHash);

      return response.data;
    } catch (error: any) {
      await this.delSecretState(tempKey);
      await this.delSecretState(orderHash);
      this.logger.error(error);
      const message = error.response?.data?.description || error.response?.data || 'unable to submit order';
      throw new BadRequestException(message);
    }
  }


  private startSecretRevealPoller(orderHash: string): void {
    const POLL_INTERVAL_MS = 10_000;

    const intervalId = setInterval(async () => {
      const secretState = await this.getSecretState(orderHash);
      if (!secretState) {
        clearInterval(intervalId);
        return;
      }

      try {
        const data = await this.sdk.getReadyToAcceptSecretFills(orderHash);
        let stateUpdated = false;
        for (const { idx } of data.fills) {
          if (secretState.submittedIdx.has(idx)) {
            continue;
          }

          const secret = secretState.secrets[idx];
          if (!secret) {
            this.logger.warn(`[${orderHash}] No secret at index ${idx}`);
            continue;
          }

          await this.sdk.submitSecret(orderHash, secret);
          secretState.submittedIdx.add(idx);
          stateUpdated = true;
          this.logger.log(`[${orderHash}] Secret revealed for fill idx ${idx}`);
        }

        if (stateUpdated) {
          await this.setSecretState(orderHash, secretState);
        }

        const { status } = await this.sdk.getOrderStatus(orderHash);

        if (status === SDKOrderStatus.Executed || status === SDKOrderStatus.Expired || status === SDKOrderStatus.Refunded) {
          const orderStausUpdate=await this.swapOrderService.updateOrderByHash({txHash:orderHash,orderStatus:SwapOrderStatus[status.toUpperCase()]});
          this.logger.log(`[${orderHash}] Order terminal reached: ${status}. Cleaning Redis state.`,"DB status:",orderStausUpdate);
          await this.firebaseNotificationService.sendNotification(
            orderStausUpdate?.deviceFcmToken as string,
            {
              title: `Received: ${orderStausUpdate?.amountOut} ${orderStausUpdate?.toToken}`,
              body: `From ${orderStausUpdate?.walletAddress?.slice(0, 4)}.....${orderStausUpdate?.walletAddress?.slice(-4)}`,
              data: { "network": orderStausUpdate?.fromChain||"", "txHash": orderStausUpdate?.txHash||"" },
            },
          );
          await this.delSecretState(orderHash);
          clearInterval(intervalId);
          return;
        }

      } catch (err) {
        this.logger.error(`[${orderHash}] Poller error (will retry):`, err?.message ?? err);
      }
    }, POLL_INTERVAL_MS);
  }

  async cancelOrder(cancelFusionOrderDto: CancelFusionOrderDto) {
    const { chain, orderHash } = cancelFusionOrderDto;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/order/cancel`;

    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };
    const response = await axios.post(url, { orderHash }, config);
    return response.data;
  }

  private generateSecrets(count: number): {
    secrets: string[];
    secretHashes: string[];
    hashLock: HashLock;
  } {
    const secrets = Array.from({ length: count }, () =>
      ethers.hexlify(ethers.randomBytes(32)),
    );

    const secretHashes = secrets.map((s) => HashLock.hashSecret(s));

    let hashLock: HashLock;
    if (count > 2) {
      const merkleLeaves = HashLock.getMerkleLeavesFromSecretHashes(secretHashes as MerkleLeaf[]);
      hashLock = HashLock.forMultipleFills(merkleLeaves);
    } else {
      hashLock = HashLock.forSingleFill(secrets[0]);
    }

    return { secrets, secretHashes, hashLock };
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
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      if(response.data.status){
        const orderStausUpdate=await this.swapOrderService.updateOrderByHash({txHash:inchOrderStatusDto.orderHash,orderStatus:SwapOrderStatus[response.data.status.toUpperCase()]});
        // await this.firebaseNotificationService.sendNotification(
        //   orderStausUpdate?.deviceFcmToken as string,
        //   {
        //     title: `Received: ${orderStausUpdate?.amountOut} ${orderStausUpdate?.toToken}`,
        //     body: `From ${orderStausUpdate?.walletAddress}`,
        //     data: { "network": orderStausUpdate?.fromChain || "", "txHash": orderStausUpdate?.txHash || "" },
        //   },
        // );
      }
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message = error.response?.data?.description || error.response?.data || 'unable to get order status';
      throw new BadRequestException(message);
    }
  }

  async fusionPlusOrderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    const url = `${process.env.FUSION_PLUS_ORDER_BASE}${inchOrderStatusDto.orderHash}`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
       if(response.data.status){
        const orderStausUpdate=await this.swapOrderService.updateOrderByHash({txHash:inchOrderStatusDto.orderHash,orderStatus:SwapOrderStatus[response.data.status.toUpperCase()]});
        // await this.firebaseNotificationService.sendNotification(
        //   orderStausUpdate?.deviceFcmToken as string,
        //   {
        //     title: `Received: ${orderStausUpdate?.amountOut} ${orderStausUpdate?.toToken}`,
        //     body: `From ${orderStausUpdate?.walletAddress?.slice(0, 4)}.....${orderStausUpdate?.walletAddress?.slice(-4)}`,
        //     data: { "network": orderStausUpdate?.fromChain || "", "txHash": orderStausUpdate?.txHash || "" },
        //   },
        // );
      }
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message = error.response?.data?.description || error.response?.data || 'unable to get order status';
      throw new BadRequestException(message);
    }
  }

  async fireCustomNotification(device: any, notificationDto: NotificationDto) {
    try {
      await this.firebaseNotificationService.sendNotification(
        device?.fcmToken as string,
        {
          title: notificationDto.title,
          body: notificationDto.body,
          data: notificationDto.data,
        },
      );
      return true;
    } catch (error) {
      throw new BadRequestException("unable to send notification");
    }
  }

}
