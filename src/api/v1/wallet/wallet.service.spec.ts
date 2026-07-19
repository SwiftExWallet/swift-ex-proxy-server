import { BadRequestException } from '@nestjs/common';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const createModelMock = (existingWallet?: any) => {
    const model: any = jest.fn();
    model.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(existingWallet ?? null),
    });

    return model;
  };

  it('finds a wallet attached to a device by any stored address', async () => {
    const existingWallet = {
      _id: 'wallet-id',
      addresses: new Map([
        [SupportedWalletChain.eth, '0x3333333333333333333333333333333333333333'],
      ]),
    };
    const model = createModelMock(existingWallet);
    const service = new WalletService(model as any);

    await expect(
      service.verifyWalletForDevice(
        'device-id',
        '0x3333333333333333333333333333333333333333',
      ),
    ).resolves.toEqual({
      walletId: 'wallet-id',
      address: '0x3333333333333333333333333333333333333333',
    });

    expect(model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'device-id',
        $or: expect.any(Array),
      }),
    );
  });

  it('rejects invalid wallet addresses', async () => {
    const service = new WalletService(createModelMock() as any);

    await expect(
      service.verifyWalletForDevice('device-id', 'not-a-wallet'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
