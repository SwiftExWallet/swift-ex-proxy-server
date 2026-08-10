import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { AddressesDto } from './create-wallet.dto';
import mongoose from 'mongoose';

export class MarkSyncFailedDto {
  @IsOptional()
  userId?: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  deviceId?: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty()
  @ValidateNested()
  addresses: Partial<AddressesDto>;

  @IsNotEmpty()
  syncError: unknown;
}
