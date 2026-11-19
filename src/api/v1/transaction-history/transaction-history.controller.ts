import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  BodySizeLimit,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';
import {
  RateLimit,
  rateLimitByIpDeviceAndWallet,
} from '../common/decorators/rate-limit.decorator';
import {
  assertWalletAddressMatches,
  getVerifiedWalletAddress,
} from '../common/helpers/requestWallet';
import { TransactionHistoryDto } from './dto/transaction-history.dto';
import { TransactionHistoryService } from './transaction-history.service';

@Controller('api/v1/transaction-history')
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Post()
  @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'transaction-history')
  @RateLimit(
    ...rateLimitByIpDeviceAndWallet('transaction-history', {
      ip: 60,
      device: 30,
      wallet: 30,
    }),
  )
  async getHistory(@Req() req: any, @Body() body: TransactionHistoryDto) {
    const verifiedAddress = getVerifiedWalletAddress(req);
    assertWalletAddressMatches(body.walletAddress, verifiedAddress);

    return await this.transactionHistoryService.getWalletTransactionHistory({
      ...body,
      walletAddress: verifiedAddress,
    });
  }
}
