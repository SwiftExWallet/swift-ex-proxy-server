import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { isAddress } from 'ethers';

export function ValidateEthereumAddresses(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'ValidateEthereumAddresses',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _: ValidationArguments) {
          if (typeof value === 'string') return isAddress(value);
          if (Array.isArray(value)) return value.every((v) => isAddress(v));
          return false;
        },
      },
    });
  };
}
