import {
  IsEnum,
  IsEthereumAddress,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { EthSwapEnum } from '../../common/enums/ethSwap.enum';

export class SwapPrepareDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;

  @IsNotEmpty()
  @IsEnum(EthSwapEnum)
  swapType: EthSwapEnum;

  @IsNotEmpty()
  approveData: string;

  @IsOptional()
  depositData: string;

  @IsNotEmpty()
  swapData: string;

  @IsNotEmpty()
  value: string;
}
