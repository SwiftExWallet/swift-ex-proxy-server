import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schema/wallet.schema';
import { ActivatedWalletRepository } from './activated-wallet.repository';
import {
  ActivatedWallet,
  ActivatedWalletSchema,
} from './schema/activated-wallet.schema';
import { NotificationModule } from '../notification/notification.module';
import { WalletSyncFailedService } from './wallet-sync-failed.service';
import { AlchemyModule } from '../on-off-ramp/alchemy/alchemy.module';
import {
  WalletSyncFailed,
  WalletSyncFailedSchema,
} from './schema/wallet-sync-failed.schema';
import { HttpService } from '../common/services/httpService';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: ActivatedWallet.name, schema: ActivatedWalletSchema },
      { name: WalletSyncFailed.name, schema: WalletSyncFailedSchema },
    ]),
    UsersModule,
    NotificationModule,
    AlchemyModule,
  ],
  providers: [
    WalletService,
    WalletRepository,
    ActivatedWalletRepository,
    WalletSyncFailedService,
    HttpService,
  ],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
