import {
  decryptFusionSecrets,
  decryptFusionSecretState,
  encryptFusionSecrets,
  encryptFusionSecretState,
  isFusionSecretStateEnvelope,
} from './encryption.util';

describe('encryption.util', () => {
  const originalEnv = process.env;
  const encryptionKey = '12345678901234567890123456789012';

  const secretPayload = {
    orderHash: '0xorder',
    secret: 'super-secret-value',
    nested: {
      idx: 1,
      value: 'nested-secret',
    },
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FUSION_SECRETS_ENCRYPTION_KEY: encryptionKey,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encryptFusionSecrets/decryptFusionSecrets', () => {
    it('round-trips encrypted Fusion secrets', () => {
      const encrypted = encryptFusionSecrets(secretPayload);

      expect(decryptFusionSecrets(encrypted)).toEqual(secretPayload);
    });

    it('does not include plaintext secret values in the encrypted payload', () => {
      const encrypted = encryptFusionSecrets(secretPayload);

      expect(encrypted).not.toContain(secretPayload.secret);
      expect(encrypted).not.toContain(secretPayload.nested.value);
    });

    it('uses the iv:authTag:ciphertext payload format', () => {
      const encrypted = encryptFusionSecrets(secretPayload);
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[a-f0-9]{32}$/);
      expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);
      expect(parts[2]).toMatch(/^[a-f0-9]+$/);
    });

    it('throws when the encryption key is missing', () => {
      delete process.env.FUSION_SECRETS_ENCRYPTION_KEY;

      expect(() => encryptFusionSecrets(secretPayload)).toThrow(
        'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
      );
      expect(() => decryptFusionSecrets('a:b:c')).toThrow(
        'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
      );
    });

    it('throws when the encryption key is not 32 bytes', () => {
      process.env.FUSION_SECRETS_ENCRYPTION_KEY = 'short-key';

      expect(() => encryptFusionSecrets(secretPayload)).toThrow(
        'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
      );
      expect(() => decryptFusionSecrets('a:b:c')).toThrow(
        'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
      );
    });

    it('throws when the encrypted payload format is invalid', () => {
      expect(() => decryptFusionSecrets('invalid-payload')).toThrow(
        'Invalid encrypted payload format.',
      );
    });

    it('throws when encrypted payload auth data is tampered', () => {
      const encrypted = encryptFusionSecrets(secretPayload);
      const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
      const tamperedAuthTag = `${authTagHex.slice(0, -1)}${
        authTagHex.endsWith('0') ? '1' : '0'
      }`;

      expect(() =>
        decryptFusionSecrets(`${ivHex}:${tamperedAuthTag}:${encryptedHex}`),
      ).toThrow();
    });
  });

  describe('Fusion secret state envelopes', () => {
    it('encrypts Fusion secret state as a JSON envelope', () => {
      const encryptedState = encryptFusionSecretState(secretPayload);
      const envelope = JSON.parse(encryptedState);

      expect(envelope).toEqual({
        version: 1,
        type: 'fusion-secret-state',
        payload: expect.any(String),
      });
      expect(envelope.payload).not.toContain(secretPayload.secret);
      expect(isFusionSecretStateEnvelope(envelope)).toBe(true);
    });

    it('round-trips encrypted Fusion secret state', () => {
      const encryptedState = encryptFusionSecretState(secretPayload);

      expect(decryptFusionSecretState(encryptedState)).toEqual(secretPayload);
    });

    it('accepts only valid Fusion secret state envelopes', () => {
      expect(
        isFusionSecretStateEnvelope({
          version: 1,
          type: 'fusion-secret-state',
          payload: 'encrypted-payload',
        }),
      ).toBe(true);
      expect(isFusionSecretStateEnvelope(null)).toBe(false);
      expect(isFusionSecretStateEnvelope('plaintext')).toBe(false);
      expect(
        isFusionSecretStateEnvelope({
          version: 2,
          type: 'fusion-secret-state',
          payload: 'encrypted-payload',
        }),
      ).toBe(false);
      expect(
        isFusionSecretStateEnvelope({
          version: 1,
          type: 'other',
          payload: 'encrypted-payload',
        }),
      ).toBe(false);
      expect(
        isFusionSecretStateEnvelope({
          version: 1,
          type: 'fusion-secret-state',
        }),
      ).toBe(false);
    });

    it('throws when encrypted state JSON is invalid', () => {
      expect(() => decryptFusionSecretState('not-json')).toThrow();
    });

    it('throws when encrypted state envelope shape is invalid', () => {
      expect(() =>
        decryptFusionSecretState(
          JSON.stringify({
            version: 1,
            type: 'other',
            payload: 'encrypted-payload',
          }),
        ),
      ).toThrow('Invalid encrypted Fusion secret state envelope.');
    });
  });
});
