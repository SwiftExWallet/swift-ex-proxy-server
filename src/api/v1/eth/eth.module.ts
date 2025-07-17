import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { EthController } from './eth.controller';
import { UsdtController } from './usdt.controller';

@Module({
  providers: [EthService],
  controllers: [EthController, UsdtController],
})
export class EthModule {}
