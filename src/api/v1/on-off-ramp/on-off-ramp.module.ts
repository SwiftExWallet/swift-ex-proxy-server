import { Module } from '@nestjs/common';
import { AlchemyModule } from './alchemy/alchemy.module';
import { BanxaModule } from './banxa/banxa.module';
import { MoonPayModule } from './moonpay/moonpay.module';

@Module({
  imports: [AlchemyModule, BanxaModule, MoonPayModule],
  exports: [AlchemyModule, BanxaModule, MoonPayModule],
})
export class OnOffRampModule {}
