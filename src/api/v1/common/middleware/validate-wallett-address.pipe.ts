import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isEthereumAddress } from 'class-validator';

@Injectable()
export class ValidateWalletAddressPipe implements PipeTransform {
  constructor(private readonly paramName?: string) {}

  transform(value: string) {
    if (!isEthereumAddress(value)) {
      throw new BadRequestException(
        `Invalid wallet address${this.paramName ? ` for "${this.paramName}"` : ''}`
      );
    }
    return value;
  }
}
