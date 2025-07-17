import { Module } from '@nestjs/common';
import { BscService } from './bsc.service';
import { BscController } from './bsc.controller';

@Module({
  providers: [BscService],
  controllers: [BscController]
})
export class BscModule {}
