import { Module } from '@nestjs/common';
import { RangoService } from './rango.service';
import { RangoController } from './rango.controller';

@Module({
  providers: [RangoService],
  controllers: [RangoController],
})
export class RangoModule {}
