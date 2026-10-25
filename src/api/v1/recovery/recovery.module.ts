import { Module } from '@nestjs/common';
import { RecoveryConfigService } from './recovery.config';
import { RecoveryController } from './recovery.controller';
import { RecoveryChainService } from './recovery-chain.service';
import { RecoveryProofService } from './recovery-proof.service';
import { RecoveryService } from './recovery.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RecoveryRegistration,
  RecoveryRegistrationSchema,
} from './schema/recovery-registration.schema';
import { RecoveryRegistrationService } from './recovery-registration.service';
import { SesHookController } from './ses-hook.controller';
import { NotificationModule } from '../notification/notification.module';
import {
  RecoveryAttempt,
  RecoveryAttemptSchema,
} from './schema/recovery-attempt.schema';
import { RecoveryAttemptService } from './recovery-attempt.service';
import { RecoveryTransactionService } from './recovery-transaction.service';

@Module({
  imports: [
    NotificationModule,
    MongooseModule.forFeature([
      {
        name: RecoveryRegistration.name,
        schema: RecoveryRegistrationSchema,
      },
      {
        name: RecoveryAttempt.name,
        schema: RecoveryAttemptSchema,
      },
    ]),
  ],
  controllers: [RecoveryController, SesHookController],
  providers: [
    RecoveryConfigService,
    RecoveryChainService,
    RecoveryProofService,
    RecoveryService,
    RecoveryRegistrationService,
    RecoveryAttemptService,
    RecoveryTransactionService,
  ],
})
export class RecoveryModule {}
