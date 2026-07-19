import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'api/v1/common/decorators/**/*.ts',
    'api/v1/common/helpers/**/*.ts',
    'api/v1/common/middleware/bigintJsonSerializer.middleware.ts',
    'api/v1/common/middleware/device-auth-token.middleware.ts',
    'api/v1/common/utils/**/*.ts',
    'api/v1/common/validation/**/*.ts',
    'api/v1/device/device.service.ts',
    'api/v1/eth/usdt.controller.ts',
    'api/v1/orders/order.repository.ts',
    'api/v1/orders/orders.service.ts',
    'api/v1/uniswap/quoter/quoter.controller.ts',
    'api/v1/users/user.repository.ts',
    'api/v1/users/users.service.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!app.module.ts',
    '!**/dto/**',
    '!**/schema/**',
    '!**/enums/**',
    '!**/interface/**',
    '!**/interfaces/**',
    '!**/abi/**',
    '!**/constants/**',
  ],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
