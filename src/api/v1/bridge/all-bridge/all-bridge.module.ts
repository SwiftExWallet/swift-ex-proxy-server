import { Module } from '@nestjs/common';
import { AllBridgeService } from './all-bridge.service';

@Module({
  providers: [AllBridgeService],
  exports: [AllBridgeService],
})
export class AllBridgeModule {}
