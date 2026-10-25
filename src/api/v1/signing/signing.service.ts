import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyMessage } from 'ethers';
import { createHash, randomBytes } from 'crypto';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { DeviceService } from '../device/device.service';
import { VerifySigningDto } from './dto/verify-signing.dto';

const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const EXPIRES_AT_REGEX = /Expires At: (.+)$/m;
const STELLAR_NETWORK =
  process.env.STELLAR_NETWORK === 'testnet'
    ? Networks.TESTNET
    : Networks.PUBLIC;

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly deviceService: DeviceService,
  ) {}

  createRequest(): { payload: string } {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    const payload = `Sign:\nNonce: ${nonce}\nExpires At: ${expiresAt}`;
    return { payload };
  }

  async verify(
    verifySigningDto: VerifySigningDto,
  ): Promise<{ valid: true; jwt: string }> {
    const { chain = 'evm', payload, signature } = verifySigningDto;

    const match = payload.match(EXPIRES_AT_REGEX);
    const expiresAtRaw = match ? match[1].trim() : null;
    this.logger.log(`Expires At: ${expiresAtRaw}`);

    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (
      !expiresAt ||
      isNaN(expiresAt.getTime()) ||
      Date.now() > expiresAt.getTime()
    ) {
      throw new BadRequestException('Signing request expired');
    }

    const walletAddress =
      chain === 'stellar'
        ? this.verifyStellarSignature(verifySigningDto)
        : this.verifyEvmSignature(payload, signature);

    const signingDeviceUniqueId = process.env.SIGNING_DEVICE_UNIQUE_ID;
    if (!signingDeviceUniqueId) {
      throw new BadRequestException('web user is not configured');
    }

    const device = await this.deviceService.findOneByUniqueId(
      signingDeviceUniqueId,
    );
    if (!device) {
      throw new NotFoundException(`Device web user not found`);
    }

    const jwt = this.jwtService.sign({
      _id: device._id,
      walletAddress,
    });

    return { valid: true, jwt };
  }

  private verifyEvmSignature(payload: string, signature?: string): string {
    if (!signature) {
      throw new BadRequestException('signature is required');
    }

    try {
      const recoveredAddress = verifyMessage(payload, signature);
      this.logger.log(`Recovered address: ${recoveredAddress}`);
      return recoveredAddress.toLowerCase();
    } catch (error) {
      this.logger.log(`Could not recover address: ${(error as Error).message}`);
      throw new BadRequestException('Invalid signature');
    }
  }

  private verifyStellarSignature(verifySigningDto: VerifySigningDto): string {
    const { payload, signature, signedXdr, stellarAddress } = verifySigningDto;
    if (!stellarAddress) {
      throw new BadRequestException('stellarAddress is required');
    }

    if (!signature && !signedXdr) {
      throw new BadRequestException('signature or signedXdr is required');
    }

    try {
      const keypair = Keypair.fromPublicKey(stellarAddress);
      if (signedXdr) {
        this.verifyStellarSignedXdr(
          payload,
          signedXdr,
          stellarAddress,
          keypair,
        );
        this.logger.log(`Verified Stellar address: ${stellarAddress}`);
        return stellarAddress;
      }

      const valid = keypair.verify(
        Buffer.from(payload, 'utf8'),
        Buffer.from(signature as string, 'base64'),
      );
      if (!valid) {
        throw new BadRequestException('Invalid signature');
      }
      this.logger.log(`Verified Stellar address: ${stellarAddress}`);
      return stellarAddress;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.log(
        `Could not verify Stellar signature: ${(error as Error).message}`,
      );
      throw new BadRequestException('Invalid signature');
    }
  }

  private verifyStellarSignedXdr(
    payload: string,
    signedXdr: string,
    stellarAddress: string,
    keypair: Keypair,
  ): void {
    const tx: any = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK);
    const expected = createHash('sha256').update(payload, 'utf8').digest();

    if (tx.operations.length !== 1) {
      throw new BadRequestException('Invalid signature');
    }

    const operation = tx.operations[0];
    if (
      tx.sequence !== '0' ||
      tx.source !== stellarAddress ||
      operation.type !== 'manageData' ||
      !operation.value ||
      !Buffer.from(operation.value).equals(expected)
    ) {
      throw new BadRequestException('Invalid signature');
    }

    const maxTime = Number(tx.timeBounds?.maxTime || 0);
    if (maxTime && maxTime < Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('Invalid signature');
    }

    const valid = tx.signatures.some((signature) =>
      keypair.verify(tx.hash(), signature.signature()),
    );
    if (!valid) {
      throw new BadRequestException('Invalid signature');
    }
  }
}
