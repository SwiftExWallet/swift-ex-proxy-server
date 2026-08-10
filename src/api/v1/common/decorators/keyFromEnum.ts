import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function KeysFromEnum(
  enumObject: Record<string, string>,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'KeysFromEnum',
      target: object.constructor,
      propertyName,
      constraints: [enumObject],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
          }

          const enumValues = new Set(
            Object.values(args.constraints[0] as Record<string, string>),
          );

          return Object.keys(value).every((key) => enumValues.has(key));
        },
      },
    });
  };
}
