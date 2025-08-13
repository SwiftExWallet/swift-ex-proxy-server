import { Module } from '@nestjs/common';
import { BridgeController } from './bridge.controller';
import { AllBridgeModule } from './all-bridge/all-bridge.module';

@Module({
  imports: [AllBridgeModule],
  controllers: [BridgeController],
})
export class BridgeModule {}
