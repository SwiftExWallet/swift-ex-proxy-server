import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ValidWalletType } from '../../../../../api/v1/common/enums/all-bridge.enum';
import { IsTokenValid } from 'src/api/v1/common/decorator/valid-token.decorator';

export class AllBridgeQuotesDto {
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  sourceChain: ValidWalletType;

  @IsNotEmpty()
  @IsString()
  @IsTokenValid()
  sourceToken: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  destinationChain: ValidWalletType;

  @IsNotEmpty()
  @IsString()
  @IsTokenValid()
  destinationToken: ValidWalletType;
}
