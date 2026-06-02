import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function encryptFusionSecrets(data: object): string {
  const keyStr = process.env.FUSION_SECRETS_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 32) {
    throw new Error('Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.');
  }
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(keyStr, 'utf8'), iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptFusionSecrets(encryptedPayload: string): object {
  const keyStr = process.env.FUSION_SECRETS_ENCRYPTION_KEY;
  if (!keyStr || keyStr.length !== 32) {
    throw new Error('Invalid or missing FUSION_SECRETS_ENCRYPTION_KEY. Must be 32 bytes.');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(keyStr, 'utf8'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}
