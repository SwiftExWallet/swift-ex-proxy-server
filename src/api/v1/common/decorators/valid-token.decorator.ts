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
    const walletType = (args.object as any)
      .sourceChain as keyof ValidWalletType;
    if (ValidWalletType[walletType] == ValidWalletType.BAS) {
      const allowedSourceTokens = ['USDC'];
      const allowedDestinationTokens = ['USDC'];
      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }
      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }

    if (
      ValidWalletType[walletType] == ValidWalletType.ETH ||
      ValidWalletType[walletType] == ValidWalletType.ARB
    ) {
      const allowedSourceTokens = ['USDT', 'USDC', 'USDe'];
      const allowedDestinationTokens = ['USDT', 'USDC', 'USDe'];
      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }
      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }

    if (
      ValidWalletType[walletType] == ValidWalletType.BNB ||
      ValidWalletType[walletType] == ValidWalletType.BSC
    ) {
      const allowedSourceTokens = ['USDT', 'USDC'];
      const allowedDestinationTokens = ['USDT', 'USDC'];
      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }
      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }

    if (
      ValidWalletType[walletType] == ValidWalletType.POL ||
      ValidWalletType[walletType] == ValidWalletType.OPT ||
      ValidWalletType[walletType] == ValidWalletType.AVA
    ) {
      const allowedSourceTokens = ['USDT', 'USDC'];
      const allowedDestinationTokens = ['USDT', 'USDC'];
      if (args.property === 'sourceToken') {
        return allowedSourceTokens.includes(token);
      }
      if (args.property === 'destinationToken') {
        return allowedDestinationTokens.includes(token);
      }
    }
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    const walletType = (args.object as any).sourceChain as string;
    const destinationChain = (args.object as any).destinationChain as string;
    if (ValidWalletType[walletType] == ValidWalletType[walletType]) {
      if (args.property === 'sourceToken') {
        return `Source Token not support for ${walletType}.`;
      }
      if (args.property === 'destinationToken') {
        return `Destination Token not support for ${destinationChain}.`;
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
