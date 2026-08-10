import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SupportedWalletChain } from '../../common/enums/chain.enum';

@Schema({ timestamps: true })
export class WalletSyncFailed extends Document {
  @Prop({ required: false })
  userId: string;

  @Prop({ required: false })
  deviceId: string;

  @Prop({
    type: Map,
    of: String,
    default: {},
  })
  addresses: Map<SupportedWalletChain, string>;

  @Prop({ default: false })
  isSynced: boolean;

  @Prop({ type: Object })
  syncError: unknown;
}

export const WalletSyncFailedSchema =
  SchemaFactory.createForClass(WalletSyncFailed);
