import {
  IsNotEmpty,
  IsString,
  Matches,
  IsEnum,
  IsOptional,
} from 'class-validator';
import {
  ValidPayFeeType,
  ValidWalletType,
} from '../../../common/enums/all-bridge.enum';

export class AllBridgeSwapDto {
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$/, {
    message: 'Invalid public key format',
  })
  fromAddress: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$/, {
    message: 'Invalid public key format',
  })
  toAddress: string;

  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsString()
  sourceToken: string; // ToDO: add validation using all bridge sdk

  @IsNotEmpty()
  @IsString()
  destinationToken: string; // TODo:  add validation using all bridge sdk

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  walletType: ValidWalletType;

  @IsNotEmpty()
  @IsEnum(ValidPayFeeType)
  feePayType: ValidPayFeeType;

  @IsOptional()
  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  destinationWalletType: ValidWalletType;
}
