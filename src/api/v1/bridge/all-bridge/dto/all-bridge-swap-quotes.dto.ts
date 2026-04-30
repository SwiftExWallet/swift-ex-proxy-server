import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ValidWalletType } from '../../../../../api/v1/common/enums/all-bridge.enum';

export class AllBridgeQuotesDto {
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  sourceChain: ValidWalletType;

  @IsNotEmpty()
  @IsString()
  sourceToken: string; // ToDO: add validation using all bridge sdk

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  destinationChain: ValidWalletType;

  @IsNotEmpty()
  @IsString()
  destinationToken: ValidWalletType; // ToDO: add validation using all bridge sdk
}
