import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import { randomUUID, sign as cryptoSign } from 'crypto';
import {
  DeviceAttestationDto,
  DeviceAttestationProvider,
} from './dto/device-attestation.dto';

type DeviceAttestationMode = 'off' | 'optional' | 'required';

export interface DeviceAttestationMetadata {
  attestationProvider: DeviceAttestationProvider;
  attestationStatus: 'verified';
  attestationVerifiedAt: Date;
  attestationPackageName?: string;
  attestationAppVerdict?: string;
  attestationDeviceVerdict?: string[];
}

interface GoogleIntegrityResponse {
  tokenPayloadExternal?: {
    requestDetails?: {
      requestPackageName?: string;
      nonce?: string;
      requestHash?: string;
      timestampMillis?: string | number;
    };
    appIntegrity?: {
      appRecognitionVerdict?: string;
      packageName?: string;
    };
    deviceIntegrity?: {
      deviceRecognitionVerdict?: string[];
    };
  };
}

interface GoogleOAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
}

@Injectable()
export class DeviceAttestationService {
  private googleAccessToken:
    | {
        token: string;
        expiresAt: number;
      }
    | undefined;

  async verify(
    attestation?: DeviceAttestationDto,
    platform?: string,
  ): Promise<DeviceAttestationMetadata | undefined> {
    const mode = this.getMode();
    if (mode === 'off') {
      return undefined;
    }

    if (!attestation) {
      if (mode === 'required') {
        throw new BadRequestException('Device attestation is required.');
      }

      return undefined;
    }

    this.assertProviderMatchesPlatform(attestation.provider, platform);

    switch (attestation.provider) {
      case DeviceAttestationProvider.PLAY_INTEGRITY:
        return this.verifyPlayIntegrity(attestation);
      case DeviceAttestationProvider.APPLE_DEVICE_CHECK:
        return this.verifyAppleDeviceCheck(attestation);
    }
  }

  private async verifyPlayIntegrity(
    attestation: DeviceAttestationDto,
  ): Promise<DeviceAttestationMetadata> {
    const packageName = this.getRequiredEnv(
      'GOOGLE_PLAY_INTEGRITY_PACKAGE_NAME',
    );
    const accessToken = await this.getGoogleAccessToken();

    let response: GoogleIntegrityResponse;
    try {
      const result = await axios.post<GoogleIntegrityResponse>(
        `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
        { integrityToken: attestation.token },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      response = result.data;
    } catch {
      throw new ForbiddenException(
        'Google Play Integrity verification failed.',
      );
    }

    const payload = response.tokenPayloadExternal;
    const requestDetails = payload?.requestDetails;
    const appIntegrity = payload?.appIntegrity;
    const deviceIntegrity = payload?.deviceIntegrity;
    const deviceVerdicts = deviceIntegrity?.deviceRecognitionVerdict ?? [];

    if (requestDetails?.requestPackageName !== packageName) {
      throw new ForbiddenException('Invalid Google Play package name.');
    }

    this.assertFresh(requestDetails.timestampMillis);
    this.assertGoogleRequestBinding(attestation, requestDetails);

    const expectedAppVerdict =
      process.env.GOOGLE_PLAY_INTEGRITY_APP_VERDICT || 'PLAY_RECOGNIZED';
    if (appIntegrity?.appRecognitionVerdict !== expectedAppVerdict) {
      throw new ForbiddenException(
        'Invalid Google Play app integrity verdict.',
      );
    }

    const allowedDeviceVerdicts = this.parseCsv(
      process.env.GOOGLE_PLAY_INTEGRITY_ALLOWED_DEVICE_VERDICTS ||
        'MEETS_DEVICE_INTEGRITY,MEETS_STRONG_INTEGRITY',
    );
    if (
      !deviceVerdicts.some((verdict) => allowedDeviceVerdicts.includes(verdict))
    ) {
      throw new ForbiddenException(
        'Invalid Google Play device integrity verdict.',
      );
    }

    return {
      attestationProvider: DeviceAttestationProvider.PLAY_INTEGRITY,
      attestationStatus: 'verified',
      attestationVerifiedAt: new Date(),
      attestationPackageName: requestDetails.requestPackageName,
      attestationAppVerdict: appIntegrity.appRecognitionVerdict,
      attestationDeviceVerdict: deviceVerdicts,
    };
  }

  private async verifyAppleDeviceCheck(
    attestation: DeviceAttestationDto,
  ): Promise<DeviceAttestationMetadata> {
    const jwt = this.createAppleJwt();
    const baseUrl =
      process.env.APPLE_DEVICE_CHECK_ENVIRONMENT === 'development'
        ? 'https://api.development.devicecheck.apple.com'
        : 'https://api.devicecheck.apple.com';

    try {
      await axios.post(
        `${baseUrl}/v1/validate_device_token`,
        {
          device_token: attestation.token,
          transaction_id: randomUUID(),
          timestamp: Date.now(),
        },
        {
          headers: { Authorization: `Bearer ${jwt}` },
        },
      );
    } catch {
      throw new ForbiddenException('Apple DeviceCheck verification failed.');
    }

    return {
      attestationProvider: DeviceAttestationProvider.APPLE_DEVICE_CHECK,
      attestationStatus: 'verified',
      attestationVerifiedAt: new Date(),
    };
  }

  private getMode(): DeviceAttestationMode {
    const value = (process.env.DEVICE_ATTESTATION_MODE || 'optional')
      .trim()
      .toLowerCase();

    return value === 'off' || value === 'required' ? value : 'optional';
  }

  private assertProviderMatchesPlatform(
    provider: DeviceAttestationProvider,
    platform?: string,
  ): void {
    const normalized = platform?.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    if (
      ['android', 'google', 'play'].some((value) =>
        normalized.includes(value),
      ) &&
      provider !== DeviceAttestationProvider.PLAY_INTEGRITY
    ) {
      throw new ForbiddenException('Android devices require Play Integrity.');
    }

    if (
      ['ios', 'iphone', 'ipad', 'apple'].some((value) =>
        normalized.includes(value),
      ) &&
      provider !== DeviceAttestationProvider.APPLE_DEVICE_CHECK
    ) {
      throw new ForbiddenException('Apple devices require DeviceCheck.');
    }
  }

  private assertGoogleRequestBinding(
    attestation: DeviceAttestationDto,
    requestDetails: NonNullable<
      GoogleIntegrityResponse['tokenPayloadExternal']
    >['requestDetails'],
  ): void {
    if (
      attestation.nonce &&
      requestDetails?.nonce !== attestation.nonce &&
      requestDetails?.requestHash !== attestation.nonce
    ) {
      throw new ForbiddenException('Invalid Google Play Integrity nonce.');
    }

    if (
      attestation.requestHash &&
      requestDetails?.requestHash !== attestation.requestHash
    ) {
      throw new ForbiddenException(
        'Invalid Google Play Integrity request hash.',
      );
    }
  }

  private assertFresh(timestampMillis: string | number | undefined): void {
    const timestamp = Number(timestampMillis);
    const maxAgeMs = Number(
      process.env.DEVICE_ATTESTATION_MAX_AGE_MS || 300000,
    );
    if (!Number.isFinite(timestamp)) {
      throw new ForbiddenException('Invalid attestation timestamp.');
    }

    const ageMs = Date.now() - timestamp;
    if (ageMs < -60000 || ageMs > maxAgeMs) {
      throw new ForbiddenException('Expired attestation token.');
    }
  }

  private async getGoogleAccessToken(): Promise<string> {
    if (process.env.GOOGLE_PLAY_INTEGRITY_ACCESS_TOKEN) {
      return process.env.GOOGLE_PLAY_INTEGRITY_ACCESS_TOKEN;
    }

    if (
      this.googleAccessToken &&
      this.googleAccessToken.expiresAt > Date.now() + 60000
    ) {
      return this.googleAccessToken.token;
    }

    const serviceAccountJson = this.getRequiredEnv(
      'GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON',
    );
    const serviceAccount = JSON.parse(serviceAccountJson) as {
      client_email?: string;
      private_key?: string;
    };
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new InternalServerErrorException(
        'Invalid Google Play Integrity service account.',
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const assertion = this.createJwt(
      'RS256',
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/playintegrity',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      },
      serviceAccount.private_key,
    );

    const result = await axios.post<GoogleOAuthTokenResponse>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    if (!result.data.access_token) {
      throw new InternalServerErrorException(
        'Google Play Integrity access token unavailable.',
      );
    }

    this.googleAccessToken = {
      token: result.data.access_token,
      expiresAt: Date.now() + (result.data.expires_in ?? 3600) * 1000,
    };

    return this.googleAccessToken.token;
  }

  private createAppleJwt(): string {
    const teamId = this.getRequiredEnv('APPLE_DEVICE_CHECK_TEAM_ID');
    const keyId = this.getRequiredEnv('APPLE_DEVICE_CHECK_KEY_ID');
    const privateKey = this.getRequiredEnv('APPLE_DEVICE_CHECK_PRIVATE_KEY');

    return this.createJwt(
      'ES256',
      { alg: 'ES256', kid: keyId },
      { iss: teamId, iat: Math.floor(Date.now() / 1000) },
      privateKey,
    );
  }

  private createJwt(
    algorithm: 'RS256' | 'ES256',
    header: Record<string, unknown>,
    payload: Record<string, unknown>,
    privateKey: string,
  ): string {
    const signingInput = `${this.base64UrlJson(header)}.${this.base64UrlJson(
      payload,
    )}`;
    const signature = cryptoSign(
      algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256',
      Buffer.from(signingInput),
      algorithm === 'ES256'
        ? {
            key: this.normalizePrivateKey(privateKey),
            dsaEncoding: 'ieee-p1363',
          }
        : this.normalizePrivateKey(privateKey),
    );

    return `${signingInput}.${this.base64Url(signature)}`;
  }

  private base64UrlJson(value: Record<string, unknown>): string {
    return this.base64Url(Buffer.from(JSON.stringify(value)));
  }

  private base64Url(value: Buffer): string {
    return value
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private normalizePrivateKey(privateKey: string): string {
    return privateKey.replace(/\\n/g, '\n');
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value?.trim()) {
      throw new InternalServerErrorException(`${name} is not configured.`);
    }

    return value;
  }

  private parseCsv(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
