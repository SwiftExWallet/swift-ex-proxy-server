import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class ActivatedWallet {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceSchema',
    required: false,
  })
  deviceId: mongoose.Schema.Types.ObjectId;

  @Prop()
  amount: string;

  @Prop()
  stellarAddress: string;
}

export const ActivatedWalletSchema =
  SchemaFactory.createForClass(ActivatedWallet);
ActivatedWalletSchema.index({ stellarAddress: 1 }, { unique: true });
