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
import { RedisModule } from './api/v1/redis/redis.module';
import { SwapModule } from './api/v1/swap/swap.module';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './api/v1/common/guard/rate-limit.guard';
import { QuoterModule } from './api/v1/quoter/quoter.module';
import { SwapOrdersModule } from './api/v1/swapOrders/swapOrders.module';
import { ScheduleModule } from '@nestjs/schedule';
import { getMongoConnectionConfig } from './api/v1/common/config/datastore.config';
import { WalletModule } from './api/v1/wallet/wallet.module';
import { BodySizeLimitGuard } from './api/v1/common/guard/body-size-limit.guard';
import { MarketDataModule } from './api/v1/market-data/market-data.module';
import { OnOffRampModule } from './api/v1/on-off-ramp/on-off-ramp.module';
import { SigningModule } from './api/v1/signing/signing.module';

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
    RedisModule,
    SwapModule,
    QuoterModule,
    SwapOrdersModule,
    WalletModule,
    MarketDataModule,
    OnOffRampModule,
    SigningModule,
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
        {
          path: 'docs',
          method: RequestMethod.ALL,
        },
        {
          path: 'docs/{*path}',
          method: RequestMethod.ALL,
        },
        {
          path: 'docs-json',
          method: RequestMethod.GET,
        },
        {
          path: '/api/v1/signing/request',
          method: RequestMethod.GET,
        },
        {
          path: '/api/v1/signing/verify',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*');
  }
}
