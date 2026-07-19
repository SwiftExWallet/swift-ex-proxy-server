import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SupportedWalletChain } from '../../common/enums/chain.enum';

@Schema({ timestamps: true })
export class Wallet {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSchema',
    required: false,
  })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceSchema',
    required: false,
  })
  deviceId: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: Map,
    of: String,
    default: {},
  })
  addresses: Map<SupportedWalletChain, string>;

  @Prop({ type: Boolean, default: false })
  isPrimary: boolean;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

WalletSchema.index({ deviceId: 1 });
WalletSchema.index({ deviceId: 1, isPrimary: 1 });
