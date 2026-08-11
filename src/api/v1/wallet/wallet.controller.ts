import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletAddressDto } from './dto/wallet-address.dto';
import { StellarAddressDto } from './dto/stellar-address.dto';

@Controller('api/v1/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}
  @Post()
  async create(
    @Req() req: any,
    @Res() response,
    @Body() createWalletDto: CreateWalletDto,
  ) {
    const wallet = await this.walletService.create(createWalletDto, req.device);
    response.status(201).json({ wallet });
  }

  @Get('/:chain/address/:walletAddress')
  async findByMultiChainAddress(
    @Req() req: any,
    @Res() response,
    @Param() walletAddressDto: WalletAddressDto,
  ) {
    console.log('===== walletAddressDto', { walletAddressDto });
    const wallets = await this.walletService.findByWalletAddress(
      walletAddressDto,
      req.device._id,
    );
    return response.status(200).json({ wallets });
  }

  @Get(':stellarAddress/address')
  async findByStellarAddress(
    @Req() req: any,
    @Res() response,
    @Param() stellarAddressDto: StellarAddressDto,
  ) {
    const wallets = await this.walletService.findByStellarAddress(
      stellarAddressDto,
      req.device._id,
    );
    return response.status(200).json({ wallets });
  }
}
