import {
  IsEnum,
  IsEthereumAddress,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChainEnum } from '../../common/enums/chain.enum';

const MAX_PAGE_KEY_LENGTH = 512;

export class TransactionHistoryDto {
  @IsEthereumAddress()
  @IsNotEmpty()
  walletAddress: string;

  @IsEnum(ChainEnum)
  @IsNotEmpty()
  chain: ChainEnum;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PAGE_KEY_LENGTH)
  sentPageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PAGE_KEY_LENGTH)
  receivedPageKey?: string;
}
