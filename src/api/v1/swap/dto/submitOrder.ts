import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { Order } from '../../orders/schema/order.schema';
import { Type } from 'class-transformer';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class OrderDto {
  @IsNotEmpty()
  @IsString()
  salt: 'string';

  @IsNotEmpty()
  @IsString()
  makerAsset: string;

  @IsNotEmpty()
  @IsString()
  takerAsset: string;

  @IsNotEmpty()
  @IsString()
  maker: string;

  @IsNotEmpty()
  @IsString()
  receiver: string;

  @IsNotEmpty()
  @IsString()
  makingAmount: string;

  @IsNotEmpty()
  @IsString()
  takingAmount: string;

  @IsNotEmpty()
  @IsString()
  makerTraits: string;
}
export class SubmitOrderDto {
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  chain: SwapNetwork;

  @IsOptional()
  @IsEnum(SwapNetwork)
  toChain?: SwapNetwork;

  @Type(() => OrderDto)
  @IsNotEmpty()
  order: OrderDto;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @IsNotEmpty()
  @IsString()
  extension: string;

  @IsNotEmpty()
  @IsString()
  quoteId: string;

  @IsNotEmpty()
  @IsString()
  orderHash: string;
}
