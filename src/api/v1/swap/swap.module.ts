import { Module } from '@nestjs/common';
import { RangoModule } from './rango/rango.module';
import { InchModule } from './1inch/1inch.module';

@Module({
  imports: [RangoModule, InchModule],
})
export class SwapModule {}
