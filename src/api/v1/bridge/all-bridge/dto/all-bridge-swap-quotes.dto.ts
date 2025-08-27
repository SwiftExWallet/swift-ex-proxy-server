import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ValidWalletType } from '../../../../../api/v1/common/enums/all-bridge.enum';

export class AllBridgeQuotesDto {
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  chainType: ValidWalletType;
}
