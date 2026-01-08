import { Module } from '@nestjs/common';
import { AllBridgeService } from './all-bridge.service';
import { ProviderModule } from '../../provider/provider.module';
import { AllBridgeBscService } from './all-bridge.bsc.service';

@Module({
  imports: [ProviderModule],
  providers: [AllBridgeService,AllBridgeBscService],
  exports: [AllBridgeService,AllBridgeBscService],
})
export class AllBridgeModule {}
