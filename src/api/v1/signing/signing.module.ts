import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [DeviceModule],
  providers: [SigningService],
  controllers: [SigningController],
})
export class SigningModule {}
