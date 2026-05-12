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
import { BridgeTxStatusDto, MultiChainWalletAddressDto, StoreSwapOrderDto } from './dto/updateOrder.dto';
import { OrderStatus } from '../common/enums/order.enum';
import { DbResult, SwapOrderRepository } from './swapOrder.repository';
import { AllbridgeCoreSdk, ChainSymbol, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import { PaginatedResult, PaginationDto } from './dto/pagination.dto';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
  constructor(
    @InjectModel(SwapOrders.name)
    private readonly swapOrders: Model<SwapOrders>,
    private readonly swapOrderRepository: SwapOrderRepository,
  ) { 
  }

  async store(device:any, dto: StoreSwapOrderDto): Promise<SwapOrders> {
    try {
      const doc = new this.swapOrders({
        ...dto,
        deviceId: device._id,
        status: dto.status ?? OrderStatus.PENDING,
        blockNumber: null,
        confirmedAt: null,
        deviceFcmToken: device.fcmToken,
      });
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

  async findByTxHash(txHash: string): Promise<DbResult<SwapOrders | null>>  {
    return await this.swapOrderRepository.findByTxHash(txHash);
  }

  async findByWallet(walletAddress: string): Promise<DbResult<SwapOrders[]>> {
    return await this.swapOrderRepository.findByWallet(walletAddress)
  }

  async getBridgeTxStatus(bridgeTxStatusDto: BridgeTxStatusDto) {
    const { provider, walletType, txHash, } = bridgeTxStatusDto;
    try {
      return await this.sdk.getTransferStatus(
        ChainSymbol[walletType],
        txHash,
      );
    } catch (err) {
      throw new BadRequestException(`Transaction not found.`);
    }
  }

    async findByWalletWithPagination(multiChainWalletAddressDto: MultiChainWalletAddressDto,pagination:PaginationDto): Promise<DbResult<PaginatedResult<SwapOrders>>> {
    return await this.swapOrderRepository.findByWalletWithPagination(multiChainWalletAddressDto.address,pagination)
  }
}