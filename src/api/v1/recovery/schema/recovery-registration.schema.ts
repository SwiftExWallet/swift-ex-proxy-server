import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'RecoveryRegistration', timestamps: true })
export class RecoveryRegistration {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, unique: true, index: true })
  walletAddress!: string;

  @Prop({ required: true })
  deviceUniqueId!: string;

  @Prop({ required: true })
  fcmToken!: string;
}

export const RecoveryRegistrationSchema =
  SchemaFactory.createForClass(RecoveryRegistration);
