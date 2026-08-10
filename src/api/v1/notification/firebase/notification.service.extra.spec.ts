import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseNotificationService } from './notification.service';

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn().mockReturnValue({}) },
  messaging: jest.fn().mockReturnValue({ send: jest.fn() }),
}));

describe('FirebaseNotificationService', () => {
  let service: FirebaseNotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const admin = jest.requireMock('firebase-admin');
    admin.apps.length = 0;
    admin.apps.splice(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [FirebaseNotificationService],
    }).compile();

    service = module.get<FirebaseNotificationService>(
      FirebaseNotificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('calls initializeApp when no apps are registered', () => {
      service.onModuleInit();
      const admin = jest.requireMock('firebase-admin');
      expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('skips initializeApp when an app is already registered', () => {
      const admin = jest.requireMock('firebase-admin');
      admin.apps.push({});
      service.onModuleInit();
      expect(admin.initializeApp).not.toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    const payload = { title: 'Test', body: 'Hello', data: { key: 'val' } };

    it('calls messaging().send with correct message structure', async () => {
      const admin = jest.requireMock('firebase-admin');
      const mockSend = admin.messaging().send;
      mockSend.mockResolvedValue('message-id-123');

      const result = await service.sendNotification('device-token', payload);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'device-token',
          notification: { title: 'Test', body: 'Hello' },
          android: expect.objectContaining({ priority: 'high' }),
          apns: expect.objectContaining({
            headers: expect.objectContaining({ 'apns-priority': '10' }),
          }),
        }),
      );
      expect(result).toBe('message-id-123');
    });

    it('includes data payload in the message', async () => {
      const admin = jest.requireMock('firebase-admin');
      const mockSend = admin.messaging().send;
      mockSend.mockResolvedValue('msg-id');

      await service.sendNotification('token', payload);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ data: { key: 'val' } }),
      );
    });

    it('returns null when messaging().send fails', async () => {
      const admin = jest.requireMock('firebase-admin');
      const mockSend = admin.messaging().send;
      mockSend.mockRejectedValue(new Error('FCM error'));

      await expect(service.sendNotification('token', payload)).resolves.toBe(
        null,
      );
    });
  });
});
