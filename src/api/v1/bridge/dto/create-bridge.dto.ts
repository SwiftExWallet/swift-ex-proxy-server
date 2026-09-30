import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { BridgeDirection } from '../types/bridge-direction.type';
import { EvmSourceChain } from '../evm/evm-source-chain';

export class CreateBridgeDto {
  @IsOptional()
  @IsEnum(EvmSourceChain)
  sourceChain?: EvmSourceChain;

  @IsOptional()
  @IsEnum(BridgeDirection)
  direction?: BridgeDirection;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9:_-]{8,128}$/)
  idempotencyKey?: string;
  @IsString()
  @IsNotEmpty()
  evmAddress: string;

  @IsString()
  @IsNotEmpty()
  stellarAddress: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message: 'amount must be a positive USDC amount with at most 6 decimals',
  })
  amount: string;

  @IsBoolean()
  fast: boolean;
}
