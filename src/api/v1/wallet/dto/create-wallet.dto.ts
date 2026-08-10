import { IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import mongoose from 'mongoose';
import { SupportedWalletChain } from '../../common/enums/chain.enum';
import { KeysFromEnum } from '../../common/decorators/keyFromEnum';

export type AddressesDto = Record<SupportedWalletChain, string>;

export class CreateWalletDto {
  @IsOptional()
  userId?: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty()
  @IsObject()
  @KeysFromEnum(SupportedWalletChain, {
    message: 'addresses key must match supported value',
  })
  addresses: AddressesDto;

  @IsOptional()
  isPrimary?: boolean;

  @IsOptional()
  deviceId?: mongoose.Schema.Types.ObjectId;
}
