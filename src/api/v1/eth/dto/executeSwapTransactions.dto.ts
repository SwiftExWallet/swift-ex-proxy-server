import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { ValidWalletType } from '../../common/enums/all-bridge.enum';

const MAX_SWAP_EXECUTE_TXS = 5;
const MAX_SIGNED_TRANSACTION_LENGTH = 20_000;

export class ExecuteSwapTransactionsDto {
  @IsArray()
  @ArrayMaxSize(MAX_SWAP_EXECUTE_TXS)
  @IsString({ each: true })
  @MaxLength(MAX_SIGNED_TRANSACTION_LENGTH, { each: true })
  txs: string[];

  @IsString()
  @IsNotEmpty()
  @IsEnum(ValidWalletType)
  broadcastChain: ValidWalletType;
}
