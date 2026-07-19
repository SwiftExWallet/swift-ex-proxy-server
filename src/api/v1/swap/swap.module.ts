import { Module } from '@nestjs/common';
import { InchModule } from './1inch/1inch.module';

@Module({
  imports: [InchModule],
})
export class SwapModule {}
