import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  APP_PLATFORMS,
  AppPlatform,
  RELEASE_VERSION,
  SERVICE_STATUSES,
  ServiceStatus,
} from '../dto/app-availability.dto';

// String _id provides MongoDB's built-in unique index even with autoIndex off.
@Schema({
  collection: 'appServiceStatuses',
  timestamps: true,
  versionKey: false,
})
export class AppServiceStatus {
  @Prop({ type: String, required: true, match: /^[a-z][a-z0-9_-]{0,63}$/ })
  _id: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: String, required: true, enum: SERVICE_STATUSES })
  status: ServiceStatus;

  @Prop({ type: String, default: '', maxlength: 500 })
  message: string;

  updatedAt: Date;
}

@Schema({
  collection: 'appPlatformVersions',
  timestamps: true,
  versionKey: false,
})
export class AppPlatformVersion {
  @Prop({ type: String, required: true, enum: APP_PLATFORMS })
  _id: AppPlatform;

  @Prop({ required: true, match: RELEASE_VERSION })
  latestVersion: string;

  @Prop({ required: true, match: RELEASE_VERSION })
  minimumSupportedVersion: string;
}

export const AppServiceStatusSchema =
  SchemaFactory.createForClass(AppServiceStatus);
export const AppPlatformVersionSchema =
  SchemaFactory.createForClass(AppPlatformVersion);
