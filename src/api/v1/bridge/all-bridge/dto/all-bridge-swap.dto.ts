import {
  IsNotEmpty,
  IsString,
  IsEthereumAddress,
  Matches,
  IsEnum,
} from 'class-validator';
import { IsTokenValid } from '../../../common/decorator/valid-token.decorator';
import { ValidPayFeeType, ValidWalletType } from '../../../common/enums/all-bridge.enum';

export class AllBridgeSwapADto {
  @IsNotEmpty()
  @IsEthereumAddress()
  fromAddress: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^G[A-Z0-9]{55}$/, {
    message: 'Invalid Stellar public key format',
  })
  toAddress: string;

  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsString()
  @IsTokenValid({ message: 'Invalid sourceToken for the given walletType.' })
  sourceToken: string;

  @IsNotEmpty()
  @IsString()
  @IsTokenValid({
    message: 'Invalid destinationToken for the given walletType.',
  })
  destinationToken: string;

  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  walletType: ValidWalletType;

  @IsNotEmpty()
  @IsEnum(ValidPayFeeType)
  feePayType: ValidPayFeeType;
}
