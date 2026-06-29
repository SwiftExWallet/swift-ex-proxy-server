import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SwapOrderStatus as OrderStatus, OrderType } from '../../common/enums/order.enum';

@Schema({ collection: 'Order', timestamps: true })
export class Order {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSchema',
    required: true,
  })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceSchema',
    required: true,
  })
  deviceId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: false, sparse: true })
  email: string;

  @Prop({ required: true })
  orderNo: string;

  @Prop({ type: Object, required: true })
  requestedPayload: object;

  @Prop({ required: true })
  url: string;

  @Prop({ type: String })
  fiatCurrency: string;

  @Prop({ type: String })
  cryptoCurrency: string;

  @Prop({ type: String })
  amount: string;

  @Prop({ type: Object, default: {} })
  webhookResponse: object;

  @Prop({ type: String, enum: OrderType, required: true })
  orderType: OrderType;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
