import { Module } from '@nestjs/common';
import { AllBridgeService } from './all-bridge.service';
import { ProviderModule } from '../../provider/provider.module';

@Module({
  imports: [ProviderModule],
  providers: [AllBridgeService],
  exports: [AllBridgeService],
})
export class AllBridgeModule {}
