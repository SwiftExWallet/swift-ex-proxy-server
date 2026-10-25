import { BadRequestException, Body, Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getVerifiedWalletAddress, walletAddressesEqual } from '../common/helpers/requestWallet';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { RecoveryOwnerDto, RecoveryTransactionConfirmationDto } from './recovery.dto';
import { RecoveryRegistrationDto, RecoveryRegistrationConfirmationDto, RecoveryRegistrationPrepareDto } from './dto/recovery-registration.dto';
import { RecoveryRegistrationService } from './recovery-registration.service';
import { RecoveryService } from './recovery.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { RecoveryTransactionService } from './recovery-transaction.service';

interface UploadedEml { buffer: Buffer; }

@Controller('api/v1/recovery')
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly registrations: RecoveryRegistrationService,
    private readonly notifications: FirebaseNotificationService,
    private readonly transactions: RecoveryTransactionService,
  ) {}

  @Post('start')
  @UseInterceptors(FileInterceptor('eml', { limits: { fileSize: 10_000 } }))
  async start(@UploadedFile() file: UploadedEml | undefined, @Body('owner') owner: string, @Req() req: any) {
    if (!file?.buffer) throw new BadRequestException('eml file is required');
    this.assertOwner(owner, req);
    const result = await this.recovery.start(owner, file.buffer);
    await this.notify(req.device, 'Recovery started', 'Your wallet recovery request has started.', owner, result);
    return result;
  }

  @Get(':owner')
  status(@Param('owner') owner: string, @Req() req: any) {
    this.assertOwner(owner, req);
    return this.recovery.status(owner);
  }

  @Post('execute')
  async execute(@Body() dto: RecoveryOwnerDto, @Req() req: any) {
    this.assertOwner(dto.owner, req);
    const result = await this.recovery.execute(dto.owner);
    await this.notify(req.device, 'Recovery completed', 'Your wallet recovery has been executed successfully.', dto.owner, result);
    return result;
  }

  @Post('registration')
  async register(@Body() dto: RecoveryRegistrationDto, @Req() req: any) {
    this.assertOwner(dto.walletAddress, req);
    if (!req.device) throw new BadRequestException('device context is required');
    const result = await this.registrations.register(dto.email, dto.walletAddress, req.device);
    await this.notify(req.device, 'Recovery enabled', 'Wallet recovery has been registered successfully.', dto.walletAddress, result);
    return result;
  }

  @Post('registration/prepare')
  prepareRegistration(@Body() dto: RecoveryRegistrationPrepareDto, @Req() req: any) {
    this.assertOwner(dto.walletAddress, req);
    return this.transactions.prepareRegistration(dto.walletAddress, dto.email, dto.assets);
  }

  @Post('registration/confirm')
  async confirmRegistration(@Body() dto: RecoveryRegistrationConfirmationDto, @Req() req: any) {
    this.assertOwner(dto.walletAddress, req);
    if (!req.device) throw new BadRequestException('device context is required');
    const result = await this.transactions.confirmRegistration(dto.walletAddress, dto.email, dto.transactionHash, req.device);
    await this.notify(req.device, 'Recovery enabled', 'Wallet recovery has been registered successfully.', dto.walletAddress, result);
    return result;
  }

  @Post('cancel/prepare')
  prepareCancellation(@Body() dto: RecoveryOwnerDto, @Req() req: any) {
    this.assertOwner(dto.owner, req);
    return this.transactions.prepareCancellation(dto.owner);
  }

  @Post('cancel/confirm')
  confirmCancellation(@Body() dto: RecoveryTransactionConfirmationDto, @Req() req: any) {
    this.assertOwner(dto.owner, req);
    return this.transactions.confirmCancellation(dto.owner, dto.transactionHash);
  }

  private async notify(
    device: any,
    title: string,
    body: string,
    walletAddress: string,
    result: any,
  ): Promise<void> {
    if (!device?.fcmToken) return;
    try {
      await this.notifications.sendNotification(device.fcmToken, {
        title,
        body,
        data: {
          event: title === 'Recovery enabled'
            ? 'recovery_registration'
            : title === 'Recovery started'
              ? 'recovery_start'
              : 'recovery_execute',
          walletAddress,
          ...(result?.userOpTx ? { userOpTx: String(result.userOpTx) } : {}),
        },
      });
    } catch {
      // Notification delivery must not turn a successful recovery operation into an API error.
      return;
    }
  }

  private assertOwner(owner: string, req: any): void {
    const verified = getVerifiedWalletAddress(req, SupportedWalletChain.xlm);
    if (!walletAddressesEqual(owner, verified)) throw new BadRequestException('owner does not match the authenticated Stellar wallet');
  }
}
