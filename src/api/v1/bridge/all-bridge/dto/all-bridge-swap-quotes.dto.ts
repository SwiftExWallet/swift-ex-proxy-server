import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ValidWalletType } from '../../../../../api/v1/common/enums/all-bridge.enum';
import { IsTokenValid } from 'src/api/v1/common/decorator/valid-token.decorator';

export class AllBridgeQuotesDto {
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  chainType: ValidWalletType;

  @IsNotEmpty()
  @IsString()
  @IsTokenValid({ message: 'Invalid sourceToken for the given walletType.' })
  sourceToken: string;
}
