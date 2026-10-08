import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { GetPortfolioDto } from './dto/get-portfolio.dto';
import { GetPortfolioQueryDto } from './dto/get-portfolio-query.dto';

@Controller('api/v1/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('/totals')
  async getDevicePortfolioTotals(@Req() req: any, @Res() response) {
    const totals = await this.portfolioService.getDevicePortfolioTotals(
      req.device._id,
    );
    response.status(200).json(totals);
  }

  @Get('/:address')
  async getPortfolio(
    @Req() req: any,
    @Res() response,
    @Param() { address }: GetPortfolioDto,
    @Query() { hardRefresh }: GetPortfolioQueryDto,
  ) {
    const tokens = await this.portfolioService.getPortfolio(
      req.device._id,
      address,
      hardRefresh === 'true',
    );
    response.status(201).json(tokens);
  }
}
