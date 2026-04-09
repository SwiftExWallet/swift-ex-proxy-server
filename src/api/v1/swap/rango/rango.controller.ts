import { Body, Controller, Get, Post } from '@nestjs/common';
import { RangoService } from './rango.service';
import { RangoRouteDto } from '../dto/rangoRoute';
import { ConfirmRouteDto } from '../dto/confirmRoute';
import { PrepareTxDto } from '../dto/prepareTxDto';
import { CheckTransactionApprovalDto } from '../dto/confirmTransactionApprovalDto';

@Controller('api/v1/swap/rango')
export class RangoController {
  constructor(private readonly rangoService: RangoService) {}

  @Get('/metadata')
  async rangoMetadata() {
    const data = await this.rangoService.metaData();
    console.log('===== data =====');
    console.log(data);
    return data;
  }

  @Post('/best/route')
  async getBestRoute(@Body() rangoRouteDto: RangoRouteDto) {
    const data = await this.rangoService.bestRoute(rangoRouteDto);
    console.log('===== data =====');
    console.log(data);
    return data;
  }

  @Post('/best/routes')
  async getBestRoutes(@Body() rangoRouteDto: RangoRouteDto) {
    const data = await this.rangoService.routes(rangoRouteDto);
    console.log('===== data =====');
    console.log(data);
    return data;
  }

  @Post('/confirm/route')
  async confirmRoute(@Body() confirmRouteDto: ConfirmRouteDto) {
    const data = await this.rangoService.confirmRoute(confirmRouteDto);
    return data;
  }

  @Post('/prepare/tx')
  async prepareTx(@Body() prepareTxDto: PrepareTxDto) {
    const data = await this.rangoService.prepareTx(prepareTxDto);
    return data;
  }

  @Post('/tx/approval')
  async checkTxApproval(
    @Body() checkTransactionApprovalDto: CheckTransactionApprovalDto,
  ) {
    const data = await this.rangoService.checkApprovalTransactionStatus(
      checkTransactionApprovalDto,
    );
    return data;
  }
}
