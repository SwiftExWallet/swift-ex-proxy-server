import { IsString, IsEnum, IsOptional, IsNotEmpty, ValidateIf, Matches, IsNumber } from 'class-validator';
import { } from '../schema/swapOrder.schema';
import { SwapNetwork, swapProvider } from '../../common/enums/chain.enum';
import { SwapOrderStatus as OrderStatus, OrderTxType } from '../../common/enums/order.enum';
import { ValidWalletType } from '../../common/enums/all-bridge.enum';
import { PaginationDto } from './pagination.dto';

export class StoreSwapOrderDto {

  @ValidateIf((o) => (o.provider === swapProvider.ONEINCH_FUSION||o.provider === swapProvider.ONEINCH_FUSION_PLUS))
  @IsString({
    message: 'quoteId must be a string',
  })
  @IsNotEmpty({
    message: 'quoteId is required for this provider',
  })
  quoteId: string;

  @ValidateIf((o) => o.provider === swapProvider.RANGO)
  @IsString({
    message: 'requestId must be a string',
  })
  @IsNotEmpty({
    message: `requestId is required for this provider`,
  })
  requestId?: string;
  
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

  @IsEnum(OrderTxType)
  @IsOptional()
  txType: OrderTxType;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsString()
  @IsOptional()
  encryptedFusionSecrets?: string;

  @IsNumber()
  @IsOptional()
  usdValue?: number;
}

export class UpdateSwapOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  blockNumber?: number | null;

  @IsOptional()
  confirmedAt?: Date | null;
}

export class MultiChainWalletAddressDto{
  @Matches(
      /^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/,
      { message: 'Invalid wallet address format' }
    )
    address: string;
}

export class OrderByWalletQueryDto extends PaginationDto {
  @Matches(
    /^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/,
    { message: 'Invalid wallet address format' },
  )
  address: string;
}

export class BridgeTxStatusDto{
  @IsString()
  @IsNotEmpty()
  txHash: string;
  
  @IsString()
  @IsNotEmpty()
  @IsEnum(ValidWalletType||SwapNetwork)
  walletType: ValidWalletType|SwapNetwork;

  @IsString()
  @IsNotEmpty()
  @IsEnum(swapProvider)
  provider: swapProvider;
}

export class UpdateTxStatusDto{
  @IsString()
  @IsNotEmpty()
  txHash: string;
  
  @IsString()
  @IsNotEmpty()
  @IsEnum(OrderStatus)
  orderStatus: OrderStatus;
}
