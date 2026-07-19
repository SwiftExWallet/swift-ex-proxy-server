import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const FUSION_SECRET_STATE_ENVELOPE_VERSION = 1;
const FUSION_SECRET_STATE_ENVELOPE_TYPE = 'fusion-secret-state';

export interface FusionSecretStateEnvelope {
  version: typeof FUSION_SECRET_STATE_ENVELOPE_VERSION;
  type: typeof FUSION_SECRET_STATE_ENVELOPE_TYPE;
  payload: string;
}

export function encryptFusionSecrets(data: object): string {
  const keyStr = process.env.FUSION_SECRETS_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 32) {
    throw new Error(
      'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
    );
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(keyStr, 'utf8'),
    iv,
  );

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptFusionSecrets(encryptedPayload: string): object {
  const keyStr = process.env.FUSION_SECRETS_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 32) {
    throw new Error(
      'Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.',
    );
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(keyStr, 'utf8'),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

export function encryptFusionSecretState(data: object): string {
  const envelope: FusionSecretStateEnvelope = {
    version: FUSION_SECRET_STATE_ENVELOPE_VERSION,
    type: FUSION_SECRET_STATE_ENVELOPE_TYPE,
    payload: encryptFusionSecrets(data),
  };

  return JSON.stringify(envelope);
}

export function isFusionSecretStateEnvelope(
  value: unknown,
): value is FusionSecretStateEnvelope {
  const envelope = value as Partial<FusionSecretStateEnvelope> | null;

  return (
    !!envelope &&
    envelope.version === FUSION_SECRET_STATE_ENVELOPE_VERSION &&
    envelope.type === FUSION_SECRET_STATE_ENVELOPE_TYPE &&
    typeof envelope.payload === 'string'
  );
}

export function decryptFusionSecretState(encryptedState: string): object {
  const parsed = JSON.parse(encryptedState);

  if (!isFusionSecretStateEnvelope(parsed)) {
    throw new Error('Invalid encrypted Fusion secret state envelope.');
  }

  return decryptFusionSecrets(parsed.payload);
}
