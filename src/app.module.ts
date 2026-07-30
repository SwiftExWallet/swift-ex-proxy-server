import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EthModule } from './api/v1/eth/eth.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './api/v1/users/users.module';
import { DeviceAuthTokenMiddleware } from './api/v1/common/middleware/device-auth-token.middleware';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { BscModule } from './api/v1/bsc/bsc.module';
import { ProviderModule } from './api/v1/provider/provider.module';
import { NotificationModule } from './api/v1/notification/notification.module';
import { DeviceModule } from './api/v1/device/device.module';
import { AllBridgeModule } from './api/v1/bridge/all-bridge/all-bridge.module';
import { BridgeModule } from './api/v1/bridge/bridge.module';
import { RedisModule } from './api/v1/redis/redis.module';
import { SwapModule } from './api/v1/swap/swap.module';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './api/v1/common/guard/rate-limit.guard';
import { QuoterModule } from './api/v1/quoter/quoter.module';
import { SwapOrdersModule } from './api/v1/swapOrders/swapOrders.module';
import { ScheduleModule } from '@nestjs/schedule';
import { getMongoConnectionConfig } from './api/v1/common/config/datastore.config';
import { WalletModule } from './api/v1/wallet/wallet.module';
import { DeviceWalletMiddleware } from './api/v1/common/middleware/device-wallet.middleware';
import { BodySizeLimitGuard } from './api/v1/common/guard/body-size-limit.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      useFactory: () => {
        const mongoConfig = getMongoConnectionConfig();
        return {
          uri: mongoConfig.uri,
          ...mongoConfig.options,
        };
      },
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '7d',
        issuer: process.env.JWT_ISSUER || undefined,
        audience: process.env.JWT_AUDIENCE || undefined,
      },
      verifyOptions: {
        ignoreExpiration: false,
        issuer: process.env.JWT_ISSUER || undefined,
        audience: process.env.JWT_AUDIENCE || undefined,
      },
    }),
    ScheduleModule.forRoot(),
    EthModule,
    UsersModule,
    BscModule,
    ProviderModule,
    NotificationModule,
    DeviceModule,
    AllBridgeModule,
    BridgeModule,
    RedisModule,
    SwapModule,
    QuoterModule,
    SwapOrdersModule,
    WalletModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: BodySizeLimitGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer
      .apply(DeviceAuthTokenMiddleware)
      .exclude(
        {
          path: '/',
          method: RequestMethod.GET,
        },
        {
          path: 'health',
          method: RequestMethod.GET,
        },
      )
      .forRoutes('*');

    consumer
      .apply(DeviceWalletMiddleware)
      .exclude(
        {
          path: 'api/v1/swap/1inch/customNotification',
          method: RequestMethod.POST,
        },
        {
          path: 'api/v1/swapOrders/bridgeOrderStatus',
          method: RequestMethod.POST,
        },
      )
      .forRoutes(
        'api/v1/quoter/*',
        'api/v1/swap/1inch/*',
        'api/v1/swapOrders/*',
        'api/v1/eth/*',
        'api/v1/usdt/*',
        'api/v1/bsc/*',
        {
          path: 'api/v1/bridge/swap-transaction/prepare',
          method: RequestMethod.POST,
        },
      );
  }
}
