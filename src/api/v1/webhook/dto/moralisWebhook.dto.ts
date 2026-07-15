import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_MORALIS_ARRAY_SIZE = 100;
const MAX_MORALIS_STRING_LENGTH = 256;

class MoralisBlockDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  hash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  timestamp?: string;
}

class MoralisNftApprovalsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  ERC721?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  ERC1155?: any[];
}

export class WebhookMoralisDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  abi?: any[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MoralisBlockDto)
  block?: MoralisBlockDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  txs?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  txsInternal?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  logs?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  chainId?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retries?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_MORALIS_STRING_LENGTH)
  streamId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  erc20Approvals?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  erc20Transfers?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  nftTokenApprovals?: any[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoralisNftApprovalsDto)
  nftApprovals?: MoralisNftApprovalsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  nftTransfers?: any[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MORALIS_ARRAY_SIZE)
  nativeBalances?: any[];

  isTestPayload(): boolean {
    if (Object.keys(this).length === 0) {
      return true;
    }

    return (
      this.chainId === '' &&
      this.block?.number === '' &&
      this.block?.hash === '' &&
      this.block?.timestamp === '' &&
      Array.isArray(this.abi) &&
      this.abi.length === 0 &&
      Array.isArray(this.txs) &&
      this.txs.length === 0 &&
      Array.isArray(this.logs) &&
      this.logs.length === 0 &&
      Array.isArray(this.erc20Transfers) &&
      this.erc20Transfers.length === 0 &&
      Array.isArray(this.nftTransfers) &&
      this.nftTransfers.length === 0 &&
      Array.isArray(this.nativeBalances) &&
      this.nativeBalances.length === 0 &&
      Array.isArray(this.erc20Approvals) &&
      this.erc20Approvals.length === 0 &&
      Array.isArray(this.nftTokenApprovals) &&
      this.nftTokenApprovals.length === 0 &&
      Array.isArray(this.nftApprovals?.ERC721) &&
      this.nftApprovals.ERC721.length === 0 &&
      Array.isArray(this.nftApprovals?.ERC1155) &&
      this.nftApprovals.ERC1155.length === 0
    );
  }
}
