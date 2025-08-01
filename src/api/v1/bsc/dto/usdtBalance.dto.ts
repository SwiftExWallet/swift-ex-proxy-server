import { IsEthereumAddress } from 'class-validator';
import { WalletAddressDto } from '../../common/dto/walletAddress.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UsdtBalanceDto extends PartialType(WalletAddressDto) {
  @IsEthereumAddress()
  tokenAddress: string;
}
