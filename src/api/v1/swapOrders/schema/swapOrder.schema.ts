import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SwapOrderStatus as OrderStatus, OrderTxType } from '../../common/enums/order.enum';
import { swapProvider } from '../../common/enums/chain.enum';

@Schema({ collection: 'SwapOrders', timestamps: true })
export class SwapOrders {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceSchema',
    required: true,
  })
  deviceId: mongoose.Schema.Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    index: true
  })
  txHash: string;

  @Prop({
    required: true,
    enum: swapProvider
  })
  provider: swapProvider;

  @Prop({ required: true })
  walletAddress: string;

  @Prop({ required: true })
  fromChain: string;

  @Prop({ required: true })
  toChain: string;

  @Prop({ required: true })
  fromToken: string;

  @Prop({ required: true })
  toToken: string;

  @Prop({ required: true })
  amountIn: string;

  @Prop({ required: true })
  amountOut: string;

  @Prop({
    required: true,
    enum: OrderTxType,
    default: OrderTxType["UNKNOWN"],
  })
  txType: OrderTxType;

  @Prop({
    required: true,
    enum: OrderStatus,
    default: OrderStatus["PENDING"],
  })
  status: OrderStatus;

  @Prop({ default: null })
  blockNumber: number;

  @Prop({ default: null })
  confirmedAt: Date;

  @Prop({ required: true })
  deviceFcmToken: string;

  @Prop({ default: null })
  encryptedFusionSecrets: string;

  @Prop({ default: 0 })
  usdValue: number;

  createdAt: Date;
  updatedAt: Date;
}

export const SwapOrderSchema = SchemaFactory.createForClass(SwapOrders);
SwapOrderSchema.index({ deviceId: 1, walletAddress: 1 });
SwapOrderSchema.index({ walletAddress: 1, createdAt: -1 });
