import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { RedisService } from '../redis/redis.service';
import * as crypto from 'crypto';
import { WebhookStellarDto } from './dto/stellarWebhook.dto';
import { WebhookMoralisDto } from './dto/moralisWebhook.dto';

function encryptToken(plaintext: string, keyBuffer: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

const TEST_KEY = crypto.randomBytes(32);
const TEST_KEY_BASE64 = TEST_KEY.toString('base64');
const SPLIT_KEY = '|';

const mockNotificationService = { sendNotification: jest.fn() };
const mockRedisService = { getKey: jest.fn(), setKey: jest.fn() };

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    process.env.TAG_SECRET_KEY = TEST_KEY_BASE64;
    process.env.NOTIFICATION_SPLIT_KEY = SPLIT_KEY;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: FirebaseNotificationService, useValue: mockNotificationService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => {
    delete process.env.TAG_SECRET_KEY;
    delete process.env.NOTIFICATION_SPLIT_KEY;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleStellar', () => {
    it('skips test payloads', async () => {
      const payload = Object.assign(new WebhookStellarDto(), { eventType: 'test' });
      const result = await service.handleStellar(payload);
      expect(result).toEqual({ status: 'ok', message: 'Test payload skipped' });
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('returns undefined when no tag or additionalData', async () => {
      const payload = Object.assign(new WebhookStellarDto(), {
        eventType: 'payment',
        data: { amount: '10', asset_type: 'credit_alphanum4', asset_code: 'USDC', additionalData: '' },
      });
      const result = await service.handleStellar(payload);
      expect(result).toBeUndefined();
    });

    it('decrypts tag and sends notification with asset code', async () => {
      const fcmToken = 'device-fcm-token';
      const tag = encryptToken(fcmToken, TEST_KEY);
      mockNotificationService.sendNotification.mockResolvedValue('msg-id');

      const payload = Object.assign(new WebhookStellarDto(), {
        eventType: 'payment',
        tag,
        data: { amount: '5.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', additionalData: '' },
      });

      const result = await service.handleStellar(payload);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        fcmToken,
        expect.objectContaining({ body: expect.stringContaining('USDC') }),
      );
      expect(result).toEqual({ status: 'ok', message: 'msg-id' });
    });

    it('uses LUMENS label when asset_type is native (XLM)', async () => {
      const tag = encryptToken('fcm-token', TEST_KEY);
      mockNotificationService.sendNotification.mockResolvedValue('ok');

      const payload = Object.assign(new WebhookStellarDto(), {
        eventType: 'payment',
        tag,
        data: { amount: '1.00', asset_type: 'native', asset_code: '', additionalData: '' },
      });

      await service.handleStellar(payload);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        'fcm-token',
        expect.objectContaining({ body: expect.stringContaining('XLM') }),
      );
    });

    it('falls back to additionalData when tag is absent', async () => {
      const fcmToken = 'token-from-additional';
      const additionalData = encryptToken(fcmToken, TEST_KEY);
      mockNotificationService.sendNotification.mockResolvedValue('ok');

      const payload = Object.assign(new WebhookStellarDto(), {
        eventType: 'payment',
        data: { amount: '2', asset_type: 'credit_alphanum4', asset_code: 'USDC', additionalData },
      });

      await service.handleStellar(payload);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        fcmToken,
        expect.anything(),
      );
    });
  });

  describe('handleWebhookMoralis', () => {
    function buildTestPayload(): WebhookMoralisDto {
      return Object.assign(new WebhookMoralisDto(), {
        chainId: '',
        block: { number: '', hash: '', timestamp: '' },
        abi: [], txs: [], logs: [], erc20Transfers: [], nftTransfers: [],
        nativeBalances: [], erc20Approvals: [], nftTokenApprovals: [],
        nftApprovals: { ERC721: [], ERC1155: [] },
      });
    }

    it('skips test payloads', async () => {
      const result = await service.handleWebhookMoralis(buildTestPayload());
      expect(result).toEqual({ status: 'ok', message: 'Test payload skipped' });
    });

    it('returns undefined for duplicate event already in Redis', async () => {
      const walletAddr = 'abcdef1234567890';
      const tag = encryptToken(`fcm-token${SPLIT_KEY}${walletAddr}`, TEST_KEY);
      mockRedisService.getKey.mockResolvedValue('1');

      const payload = Object.assign(new WebhookMoralisDto(), {
        chainId: '0x1', confirmed: true, tag,
        block: { number: '100', hash: '0xblock', timestamp: '1234' },
        abi: [], logs: [], txsInternal: [], retries: 0, streamId: 's1',
        nftApprovals: { ERC721: [], ERC1155: [] }, nftTransfers: [], nftTokenApprovals: [],
        nativeBalances: [], erc20Approvals: [], txs: [],
        erc20Transfers: [{
          toAddress: `0x${walletAddr}`, hash: '0xabc123',
          valueWithDecimals: '10.0', tokenSymbol: 'USDC',
        }],
      });

      const result = await service.handleWebhookMoralis(payload);
      expect(result).toBeUndefined();
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('sends notification and caches txHash for valid ERC-20 transfer', async () => {
      const fcmToken = 'fcm-token';
      const walletAddr = 'abcdef1234567890';
      const tag = encryptToken(`${fcmToken}${SPLIT_KEY}${walletAddr}`, TEST_KEY);
      const txHash = '0xnew456';

      mockRedisService.getKey.mockResolvedValue(null);
      mockNotificationService.sendNotification.mockResolvedValue('msg-id');

      const payload = Object.assign(new WebhookMoralisDto(), {
        chainId: '0x1', confirmed: true, tag,
        block: { number: '101', hash: '0xblock2', timestamp: '5678' },
        abi: [], logs: [], txsInternal: [], retries: 0, streamId: 's2',
        nftApprovals: { ERC721: [], ERC1155: [] }, nftTransfers: [], nftTokenApprovals: [],
        nativeBalances: [], erc20Approvals: [], txs: [],
        erc20Transfers: [{
          toAddress: `0x${walletAddr}`, hash: txHash,
          valueWithDecimals: '25.5', tokenSymbol: 'USDT',
        }],
      });

      await service.handleWebhookMoralis(payload);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        fcmToken,
        expect.objectContaining({ body: expect.stringContaining('USDT') }),
      );
      expect(mockRedisService.setKey).toHaveBeenCalledWith(txHash, '1');
    });

    it('returns undefined when toAddress does not match wallet address', async () => {
      const walletAddr = 'aaaaaaaaaaaaaaaaaa';
      const tag = encryptToken(`fcm-token${SPLIT_KEY}${walletAddr}`, TEST_KEY);
      mockRedisService.getKey.mockResolvedValue(null);

      const payload = Object.assign(new WebhookMoralisDto(), {
        chainId: '0x1', confirmed: true, tag,
        block: { number: '102', hash: '0xblock3', timestamp: '9999' },
        abi: [], logs: [], txsInternal: [], retries: 0, streamId: 's3',
        nftApprovals: { ERC721: [], ERC1155: [] }, nftTransfers: [], nftTokenApprovals: [],
        nativeBalances: [], erc20Approvals: [], txs: [],
        erc20Transfers: [{
          toAddress: '0xDIFFERENTADDRESS', hash: '0xhash789',
          valueWithDecimals: '5.0', tokenSymbol: 'DAI',
        }],
      });

      const result = await service.handleWebhookMoralis(payload);
      expect(result).toBeUndefined();
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });
});
