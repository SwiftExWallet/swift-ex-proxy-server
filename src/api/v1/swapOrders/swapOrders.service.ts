import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SwapOrders } from './schema/swapOrder.schema';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { BridgeTxStatusDto, MultiChainWalletAddressDto, StoreSwapOrderDto, UpdateTxStatusDto } from './dto/updateOrder.dto';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import { AllbridgeCoreSdk, ChainSymbol, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import { PaginatedResult, PaginationDto } from './dto/pagination.dto';
import { InchWsPollerService } from '../crons/inchWsPoller.service';
import { ChainId, swapProvider } from '../common/enums/chain.enum';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>,
    private readonly swapOrderRepository: SwapOrderRepository,
    private readonly inchWsPollerService: InchWsPollerService,
  ) { 
  }

  async store(device:any, dto: StoreSwapOrderDto): Promise<SwapOrders> {
    const {fromChain,txHash,quoteId}=dto;
    try {
      const doc = new this.swapOrders({
        ...dto,
        deviceId: device._id,
        status: dto.status ?? SwapOrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
        deviceFcmToken: device.fcmToken,
      });
      await this.inchWsPollerService.subscribeOrder(txHash, ChainId[fromChain] as any, quoteId);
      return await doc.save();
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
}