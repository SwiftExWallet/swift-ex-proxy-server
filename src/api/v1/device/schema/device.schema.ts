import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class Device {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSchema',
    required: true,
  })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop()
  fcmToken: string;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
