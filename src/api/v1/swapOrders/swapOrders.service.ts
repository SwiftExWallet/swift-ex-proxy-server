import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, StoreSwapOrderDto, UpdateTxStatusDto } from './dto/updateOrder.dto';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import { AllbridgeCoreSdk, ChainSymbol, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import { PaginatedResult, PaginationDto } from './dto/pagination.dto';
import { InchWsPollerService } from '../swap/1inch/inchWsPoller.service';
import { ChainId, swapProvider } from '../common/enums/chain.enum';
import { InchFusionPlusWsPollerService } from '../swap/1inch/inchFusionPlusWsPoller.service';
import { NearIntentPollerService } from '../swap/nearIntent/nearIntentPoller.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>,
    private readonly swapOrderRepository: SwapOrderRepository,
     @Inject(forwardRef(() => InchWsPollerService))
    private readonly inchWsPollerService: InchWsPollerService,
    private readonly inchFusionPlusWsPollerService: InchFusionPlusWsPollerService,
    private readonly nearIntentPollerService: NearIntentPollerService,
  ) { 
  }

  async store(device:any, dto: StoreSwapOrderDto): Promise<SwapOrders> {
    const {fromChain,txHash,quoteId,provider,memo}=dto;
    try {
      let usdValue = dto.usdValue;

      if (['USDT', 'USDC'].includes(dto.fromToken?.toUpperCase())) {
        usdValue = Number(dto.amountIn);
      }

      const doc = new this.swapOrders({
        ...dto,
        usdValue,
        deviceId: device._id,
        status: dto.status ?? SwapOrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
        deviceFcmToken: device.fcmToken,
      });
      this.logger.debug("doc",doc);
      // if(provider===swapProvider.ONEINCH_FUSION){
      //   await this.inchWsPollerService.subscribeOrder(txHash, ChainId[fromChain] as any, quoteId);
      // }
      if(provider===swapProvider.ONEINCH_FUSION_PLUS)
      {
        this.inchFusionPlusWsPollerService.subscribeOrder(txHash, quoteId);
      }
      if(provider===swapProvider.NEARINTENT)
      {
        this.nearIntentPollerService.startPolling(txHash, String(doc._id), memo);
      }
      const response=await doc.save();
      this.logger.debug("save response",response);
      return response;
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          `Transaction with txHash "${dto.txHash}" already exists.`,
        );
      }
      this.logger.error('Failed to store transaction', err);
      throw new InternalServerErrorException('Could not save transaction.');
    }
  }

  async updateOrderStatus(orderHash: string, status: SwapOrderStatus){
    const swapOrder = await this.swapOrderRepository.findByTxHash(orderHash);
    if(!swapOrder){
      this.logger.error(`Swap order not found for orderHash ${orderHash}`);
      return;
    }
    return this.swapOrderRepository.updateStatus(orderHash, status)
  }

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>>  {
    return await this.swapOrderRepository.findByTxHash(txHash);
  }

  async findByWallet(walletAddress: string): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByWallet(walletAddress)
  }

  async findPendingByProvider(provider: swapProvider): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProvider(provider);
  }

  async findPendingByProviderSince(provider: swapProvider, since: Date): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findPendingByProviderSince(provider, since);
  }

  async findByProviderAndStatusesSince(provider: swapProvider, statuses: SwapOrderStatus[], since: Date): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByProviderAndStatusesSince(provider, statuses, since);
  }

  async getBridgeTxStatus(bridgeTxStatusDto:any) {
    const { provider, walletType, txHash, } = bridgeTxStatusDto;
    try {
      switch (provider) {
        case swapProvider.ALLBRIDGE:
          return await this.sdk.getTransferStatus(
            ChainSymbol[walletType],
            txHash,
          );
        default:
          return `${provider} service not active yet.`
      }

    } catch (err) {
      throw new BadRequestException(`Transaction not found.`);
    }
  }

    async findByWalletWithPagination(multiChainWalletAddressDto: MultiChainWalletAddressDto,pagination:PaginationDto): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    return await this.swapOrderRepository.findByWalletWithPagination(multiChainWalletAddressDto.address,pagination)
  }

  async updateOrder(updateTxStatusDto: UpdateTxStatusDto): Promise<DbResult<void>>  {
    return await this.swapOrderRepository.updateStatus(updateTxStatusDto.txHash,updateTxStatusDto.orderStatus);
  }

  async updateOrderByHash(updateTxStatusDto: UpdateTxStatusDto): Promise<SwapOrders|null>  {
    return await this.swapOrderRepository.updateOrderStatus(updateTxStatusDto.txHash,updateTxStatusDto.orderStatus);
  }

  async updateOrderById(id: string, orderStatus: SwapOrderStatus): Promise<SwapOrders | null> {
    return await this.swapOrderRepository.updateOrderStatusById(id, orderStatus);
  }
}
