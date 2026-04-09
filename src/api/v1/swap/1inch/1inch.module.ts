import { Module } from '@nestjs/common';
import { inchController } from './1inch.controller';
import { InchService } from './1inch.service';

@Module({
  providers: [InchService],
  controllers: [inchController],
})
export class InchModule {}
