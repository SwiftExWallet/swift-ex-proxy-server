import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { swapProvider } from '../../common/enums/chain.enum';

@Schema({ collection: 'ExhaustedOrders', timestamps: true })
export class ExhaustedOrder {
  @Prop({ required: true, index: true })
  txHash: string;

  @Prop({ required: true, enum: swapProvider })
  provider: swapProvider;

  @Prop({ default: null })
  memo: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SwapOrders',
    default: null,
  })
  swapOrderId: mongoose.Types.ObjectId;

  @Prop({ default: null })
  deviceFcmToken: string;

  @Prop({ required: true, default: Date.now, expires: '3d' })
  exhaustedAt: Date;
}

export const ExhaustedOrderSchema =
  SchemaFactory.createForClass(ExhaustedOrder);
