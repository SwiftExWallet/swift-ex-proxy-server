import { IsEnum, IsNotEmpty } from 'class-validator';
import { EthSwapEnum } from '../../common/enums/ethSwap.enum';

export class SwapPrepareDto {
  @IsNotEmpty()
  address: string;

  @IsNotEmpty()
  @IsEnum(EthSwapEnum)
  swapType: EthSwapEnum;

  @IsNotEmpty()
  approveData: string;

  @IsNotEmpty()
  depositData: string;

  @IsNotEmpty()
  swapData: string;

  @IsNotEmpty()
  value: string;
}
