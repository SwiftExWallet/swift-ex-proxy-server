import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { } from '../schema/swapOrder.schema';
import { SwapNetwork, swapProvider } from '../../common/enums/chain.enum';
import { OrderStatus } from '../../common/enums/order.enum';

export class StoreSwapOrderDto {
  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsNotEmpty()
  @IsEnum(swapProvider)
  provider: swapProvider;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  fromChain: SwapNetwork;

  @IsString()
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  toChain: SwapNetwork;

  @IsString()
  @IsNotEmpty()
  fromToken: string;

  @IsString()
  @IsNotEmpty()
  toToken: string;

  @IsString()
  @IsNotEmpty()
  amountIn: string;

  @IsString()
  @IsNotEmpty()
  amountOut: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;
}

export class UpdateSwapOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  blockNumber?: number | null;

  @IsOptional()
  confirmedAt?: Date | null;
}