import { Controller, Post, Body, Res, Req, Patch } from '@nestjs/common';
import { DeviceService } from './device.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceAttestationBodyDto } from './dto/device-attestation.dto';

@Controller('api/v1/device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post()
  async create(@Res() response, @Body() createDeviceDto: CreateDeviceDto) {
    const deviceToken = await this.deviceService.create(createDeviceDto);
    response.status(201).json({ deviceToken });
  }

  @Patch('update-fcm-token')
  async updateFcmToken(
    @Req() req: any,
    @Res() response,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto,
  ) {
    const device = await this.deviceService.updateFcmToken(
      req.device._id,
      updateFcmTokenDto,
    );
    return response.status(200).json({ device });
  }

  @Patch('/update-user')
  async updateUser(
    @Req() req: any,
    @Res() response,
    @Body() body: DeviceAttestationBodyDto = {},
  ) {
    const device = await this.deviceService.updateUser(
      req.device,
      req.currentUser,
      body.attestation,
    );
    return response.status(200).json({ device });
  }
}
