import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { ValidWalletType } from '../enums/all-bridge.enum';

@ValidatorConstraint({ async: false })
export class validations_token implements ValidatorConstraintInterface {
  validate(token: string, args: ValidationArguments) {
    const walletType = (args.object as any).walletType as keyof ValidWalletType;

    if (ValidWalletType[walletType] == ValidWalletType.ETH) {
      const allowedSourceTokens = ['USDT', 'USDC'];
      const allowedDestinationTokens = ['USDC', 'aeETH'];

      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }

      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }

    if (ValidWalletType[walletType] == ValidWalletType.BNB) {
      const allowedSourceTokens = ['USDT', 'BNB'];
      const allowedDestinationTokens = ['BNB', 'aeETH'];

      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }

      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const walletType = (args.object as any).walletType as string;
    if (ValidWalletType[walletType] == ValidWalletType.ETH) {
      if (args.property === 'sourceToken') {
        return `SourceToken must be either USDT or USDC for Ethereum walletType.`;
      }
      if (args.property === 'destinationToken') {
        return `DestinationToken must be either USDC or aeETH for Ethereum walletType.`;
      }
    }
    if (ValidWalletType[walletType] == ValidWalletType.BNB) {
      if (args.property === 'sourceToken') {
        return `SourceToken must be either USDT or BNB for BNB walletType.`;
      }
      if (args.property === 'destinationToken') {
        return `DestinationToken must be either BNB or aeETH for BNB walletType.`;
      }
    }
    return `Invalid token.`;
  }
}
export function IsTokenValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: validations_token,
    });
  };
}
