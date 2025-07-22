import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EthModule } from './api/v1/eth/eth.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './api/v1/users/users.module';
import { AuthTokenMiddleware } from './api/v1/common/middleware/auth-token.middleware';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { BscModule } from './api/v1/bsc/bsc.module';
import { AlchemyModule } from './api/v1/alchemy/alchemy.module';
import { ProviderModule } from './api/v1/provider/provider.module';
import { NotificationModule } from './api/v1/notification/notification.module';

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
      signOptions: { expiresIn: '1s' },
      verifyOptions: { ignoreExpiration: false },
    }),
    EthModule,
    UsersModule,
    BscModule,
    AlchemyModule,
    ProviderModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(AuthTokenMiddleware).forRoutes('*');
  }
}
