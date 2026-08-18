import { Module } from '@nestjs/common';
import { AlchemyModule } from './alchemy/alchemy.module';
import { BanxaModule } from './banxa/banxa.module';
import { MoonPayModule } from './moonpay/moonpay.module';
import { UserQueueService } from '../common/user-queue/user-queue.service';
import { OnOffRampController } from './on-off-ramp.controller';
import { OnOffRampService } from './on-off-ramp.service';

@Module({
  imports: [AlchemyModule, BanxaModule, MoonPayModule],
  controllers: [OnOffRampController],
  providers: [OnOffRampService, UserQueueService],
  exports: [AlchemyModule, BanxaModule, MoonPayModule],
})
export class OnOffRampModule {}
