import { IsNotEmpty, IsOptional } from 'class-validator';
import mongoose from 'mongoose';

export class CreateActivatedWalletDto {
  @IsNotEmpty()
  deviceId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty()
  stellarAddress: string;

  @IsOptional()
  amount: number;
}
