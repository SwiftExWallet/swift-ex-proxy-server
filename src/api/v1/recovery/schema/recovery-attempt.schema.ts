import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RecoveryAttemptStatus } from '../recovery.types';

@Schema({ collection: 'RecoveryAttempt', timestamps: true })
export class RecoveryAttempt {
  @Prop({ required: true, index: true })
  owner!: string;

  @Prop({ required: true, enum: Object.values(RecoveryAttemptStatus) })
  status!: RecoveryAttemptStatus;

  @Prop()
  startUserOpTx?: string;

  @Prop()
  executeUserOpTx?: string;

  @Prop()
  destination?: string;

  @Prop()
  unlockAt?: string;

  @Prop()
  error?: string;
}

export const RecoveryAttemptSchema =
  SchemaFactory.createForClass(RecoveryAttempt);
