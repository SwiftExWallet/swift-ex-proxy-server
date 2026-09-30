import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function bridgeConfig<T>(config: ConfigService, key: string): T {
  const value = config.get<T>(`blockchain.${key}`);
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'number' && !Number.isFinite(value))
  ) {
    throw new ServiceUnavailableException(
      `Bridge configuration missing: ${key}`,
    );
  }
  return value;
}
