import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { EthController } from './eth.controller';

@Module({
  providers: [EthService],
  controllers: [EthController]
})
export class EthModule {}
