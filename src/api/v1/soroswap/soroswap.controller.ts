import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

import {
  RateLimit,
  rateLimitByIpAndDevice,
} from '../common/decorators/rate-limit.decorator';

import { SupportedWalletChain } from '../common/enums/chain.enum';

import {
  getVerifiedWalletAddress,
  RequestWallet,
} from '../common/helpers/requestWallet';

import {
  BroadcastSoroswapDto,
  SoroswapQuoteDto,
} from './dto/soroswap.dto';

import { SoroswapService } from './soroswap.service';

@ApiTags('Soroswap')
@Controller('api/v1/soroswap')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class SoroswapController {
  constructor(
    private readonly service: SoroswapService,
  ) { }

  @Post('quote')
  @HttpCode(200)
  @BodySizeLimit(
    BODY_SIZE_LIMITS.simple,
    'soroswap-quote',
  )
  @RateLimit(
    ...rateLimitByIpAndDevice('soroswap-quote', {
      ip: 30,
      device: 15,
    }),
  )
  quote(
    @Body() dto: SoroswapQuoteDto,
    @Req() req: { wallet?: RequestWallet },
  ) {
    return this.service.quote(dto);
  }

  @Post('prepare-swap')
  @HttpCode(200)
  @BodySizeLimit(
    BODY_SIZE_LIMITS.simple,
    'soroswap-prepare',
  )
  @RateLimit(
    ...rateLimitByIpAndDevice('soroswap-prepare', {
      ip: 20,
      device: 10,
    }),
  )
  prepareSwap(
    @Body() dto: SoroswapQuoteDto,
    @Req() req: { wallet?: RequestWallet },
  ) {
    return this.service.prepareSwap(
      dto,
      getVerifiedWalletAddress(
        req,
        SupportedWalletChain.xlm,
      ),
    );
  }

  @Post('broadcast')
  @HttpCode(200)
  @BodySizeLimit(
    BODY_SIZE_LIMITS.signedTransactionBatch,
    'soroswap-broadcast',
  )
  @RateLimit(
    ...rateLimitByIpAndDevice('soroswap-broadcast', {
      ip: 30,
      device: 15,
    }),
  )
  broadcast(
    @Body() dto: BroadcastSoroswapDto,
    @Req() req: { wallet?: RequestWallet },
  ) {
    return this.service.broadcast(
      dto,
      getVerifiedWalletAddress(
        req,
        SupportedWalletChain.xlm,
      ),
    );
  }
}