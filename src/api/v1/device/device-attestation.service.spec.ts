import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import axios from 'axios';
import { DeviceAttestationService } from './device-attestation.service';
import { DeviceAttestationProvider } from './dto/device-attestation.dto';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DeviceAttestationService', () => {
  const originalEnv = process.env;
  let service: DeviceAttestationService;

  beforeEach(() => {
    process.env = { ...originalEnv, DEVICE_ATTESTATION_MODE: 'optional' };
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    mockedAxios.post.mockReset();
    service = new DeviceAttestationService();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('allows missing attestation when attestation mode is optional', async () => {
    await expect(service.verify(undefined)).resolves.toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects missing attestation when attestation mode is required', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'required';

    await expect(service.verify(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('verifies Google Play Integrity verdicts', async () => {
    process.env.GOOGLE_PLAY_INTEGRITY_PACKAGE_NAME = 'com.swiftex.app';
    process.env.GOOGLE_PLAY_INTEGRITY_ACCESS_TOKEN = 'access-token';
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: {
            requestPackageName: 'com.swiftex.app',
            nonce: 'nonce-1',
            timestampMillis: '1799999999000',
          },
          appIntegrity: {
            appRecognitionVerdict: 'PLAY_RECOGNIZED',
          },
          deviceIntegrity: {
            deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
          },
        },
      },
    });

    await expect(
      service.verify({
        provider: DeviceAttestationProvider.PLAY_INTEGRITY,
        token: 'integrity-token',
        nonce: 'nonce-1',
      }),
    ).resolves.toMatchObject({
      attestationProvider: DeviceAttestationProvider.PLAY_INTEGRITY,
      attestationStatus: 'verified',
      attestationPackageName: 'com.swiftex.app',
      attestationDeviceVerdict: ['MEETS_DEVICE_INTEGRITY'],
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://playintegrity.googleapis.com/v1/com.swiftex.app:decodeIntegrityToken',
      { integrityToken: 'integrity-token' },
      {
        headers: { Authorization: 'Bearer access-token' },
      },
    );
  });

  it('rejects invalid Google Play Integrity verdicts', async () => {
    process.env.GOOGLE_PLAY_INTEGRITY_PACKAGE_NAME = 'com.swiftex.app';
    process.env.GOOGLE_PLAY_INTEGRITY_ACCESS_TOKEN = 'access-token';
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: {
            requestPackageName: 'com.swiftex.app',
            nonce: 'nonce-1',
            timestampMillis: '1799999999000',
          },
          appIntegrity: {
            appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
          },
          deviceIntegrity: {
            deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
          },
        },
      },
    });

    await expect(
      service.verify({
        provider: DeviceAttestationProvider.PLAY_INTEGRITY,
        token: 'integrity-token',
        nonce: 'nonce-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates Apple DeviceCheck tokens with Apple', async () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    process.env.APPLE_DEVICE_CHECK_TEAM_ID = 'TEAMID1234';
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'KEYID1234';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY = privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string;
    process.env.APPLE_DEVICE_CHECK_ENVIRONMENT = 'development';
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: {} });

    await expect(
      service.verify({
        provider: DeviceAttestationProvider.APPLE_DEVICE_CHECK,
        token: 'apple-token',
      }),
    ).resolves.toMatchObject({
      attestationProvider: DeviceAttestationProvider.APPLE_DEVICE_CHECK,
      attestationStatus: 'verified',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.development.devicecheck.apple.com/v1/validate_device_token',
      {
        device_token: 'apple-token',
        transaction_id: expect.any(String),
        timestamp: 1_800_000_000_000,
      },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /),
        },
      },
    );
  });
});
