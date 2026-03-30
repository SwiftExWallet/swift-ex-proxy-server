import { Module } from '@nestjs/common';
import { InchService } from './services/1inch/1inch.service';
import { SwapController } from './swap.controller';

@Module({
  providers: [InchService],
  controllers: [SwapController],
})
export class SwapModule {}
