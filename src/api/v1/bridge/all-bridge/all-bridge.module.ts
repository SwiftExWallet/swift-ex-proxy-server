import { Module } from '@nestjs/common';
import { ProviderModule } from '../../provider/provider.module';
import { AllBridgeService } from './all-bridge.service';
import { ProviderService } from '../../provider/provider.service';

@Module({
  imports: [ProviderModule],
  providers: [AllBridgeService,ProviderService],
  exports: [AllBridgeService],
})
export class AllBridgeModule {}
