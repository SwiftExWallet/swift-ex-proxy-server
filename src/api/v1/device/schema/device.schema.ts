import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class Device {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSchema',
    required: false,
  })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: String })
  brand: string;

  @Prop({ type: String })
  model: string;

  @Prop({ type: String, required: true })
  uniqueId: string;

  @Prop({ type: String })
  type: string;

  @Prop({ type: String, required: true })
  macAddress: string;

  @Prop()
  fcmToken: string;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
