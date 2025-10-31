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
import { AlchemyModule } from './api/v1/alchemy/alchemy.module';
import { ProviderModule } from './api/v1/provider/provider.module';
import { NotificationModule } from './api/v1/notification/notification.module';
import { WebhookModule } from './api/v1/webhook/webhook.module';
import { OrdersModule } from './api/v1/orders/orders.module';
import { DeviceModule } from './api/v1/device/device.module';
import { AllBridgeModule } from './api/v1/bridge/all-bridge/all-bridge.module';
import { BridgeModule } from './api/v1/bridge/bridge.module';
import { RedisModule } from './api/v1/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_CONN_STRING as any, {
      dbName: process.env.DB_NAME,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
      verifyOptions: { ignoreExpiration: false },
    }),
    EthModule,
    UsersModule,
    BscModule,
    AlchemyModule,
    ProviderModule,
    NotificationModule,
    WebhookModule,
    OrdersModule,
    DeviceModule,
    AllBridgeModule,
    BridgeModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer
      .apply(DeviceAuthTokenMiddleware)
      .exclude(
        {
          path: 'health',
          method: RequestMethod.GET,
        },
        {
          path: 'api/v1/webhook/stellar-transactions',
          method: RequestMethod.POST,
        },
        {
          path: '/api/v1/webhook/moralis-transactions',
          method: RequestMethod.POST,
        },
        {
          path: '/api/v1/webhook/alchemy-on-ramp',
          method: RequestMethod.POST,
        },
        {
          path: '/api/v1/webhook/alchemy-off-ramp',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*');
  }
}
