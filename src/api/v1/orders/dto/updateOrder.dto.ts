import { IsEnum, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import mongoose from 'mongoose';
import { SwapOrderStatus as OrderStatus, OrderType } from '../../common/enums/order.enum';

export class UpdateOrderDto {
  @IsNotEmpty()
  _id: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty()
  userId: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  email: string;

  @IsNotEmpty()
  orderNo: string;

  @IsOptional()
  @IsObject()
  requestedPayload: Record<string, any>;

  @IsOptional()
  url: string;

  @IsNotEmpty()
  fiatCurrency: string;

  @IsOptional()
  cryptoCurrency: string;

  @IsOptional()
  @IsObject()
  webhookResponse: Record<string, any>;

  @IsOptional()
  @IsEnum(() => OrderType)
  orderType: OrderType;

  @IsNotEmpty()
  @IsEnum(() => OrderStatus)
  status: OrderStatus;
}
