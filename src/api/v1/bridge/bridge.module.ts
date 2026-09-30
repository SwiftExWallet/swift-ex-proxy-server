import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BRIDGE_TRANSFER_MODEL,
  BridgeTransferSchema,
} from './schema/bridge-transfer.schema';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeRepository } from './repositories/bridge.repository';
import { EvmService } from './evm/evm.service';
import { StellarService } from './stellar/stellar.service';
import { CircleService } from './circle/circle.service';
import { StellarToEvmService } from './stellar-to-evm.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BRIDGE_TRANSFER_MODEL, schema: BridgeTransferSchema },
    ]),
  ],
  controllers: [BridgeController],

  providers: [
    BridgeService,
    BridgeRepository,
    EvmService,
    StellarService,
    CircleService,
    StellarToEvmService,
  ],
  exports: [BridgeService],
})
export class BridgeModule {}
