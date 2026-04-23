import { IsEnum, IsEthereumAddress, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ChainEnum } from "../../common/enums/chain.enum";

export class TransactionHistoryDto {
  @IsEthereumAddress()
  @IsNotEmpty()
  @IsString()
  walletAddress: string;

  @IsString()
  @IsOptional()
  sentPageKey?: string;

  @IsString()
  @IsOptional()
  receivedPageKey?: string;

  @IsEnum(ChainEnum)
  @IsString()
  chain: any;
}