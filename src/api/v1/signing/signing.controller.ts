import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { SigningService } from './signing.service';
import { VerifySigningDto } from './dto/verify-signing.dto';

@Controller('api/v1/signing')
export class SigningController {
  constructor(private readonly signingService: SigningService) {}

  @Get('request')
  request(@Res() response) {
    const result = this.signingService.createRequest();
    response.status(200).json(result);
  }

  @Post('verify')
  async verify(@Res() response, @Body() verifySigningDto: VerifySigningDto) {
    const result = await this.signingService.verify(verifySigningDto);
    response.status(200).json(result);
  }
}
