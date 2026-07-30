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

  it('finds a wallet attached to a device by any stored wallet address', async () => {
    const existingWallet = {
      _id: 'wallet-id',
      userId: 'user-id',
      deviceId: 'device-id',
      addresses: new Map([
        [
          SupportedWalletChain.eth,
          '0x1111111111111111111111111111111111111111',
        ],
        [
          SupportedWalletChain.bnb,
          '0x3333333333333333333333333333333333333333',
        ],
      ]),
      isPrimary: true,
    };
    const model = createModelMock(existingWallet);
    const service = new WalletService(model);

    const verifiedWallet = await service.verifyWalletForDevice(
      'device-id',
      '0x3333333333333333333333333333333333333333',
    );

    expect(verifiedWallet).toMatchObject({
      _id: 'wallet-id',
      userId: 'user-id',
      deviceId: 'device-id',
      isPrimary: true,
      walletId: 'wallet-id',
      address: '0x3333333333333333333333333333333333333333',
    });
    expect(verifiedWallet?.addresses).toBe(existingWallet.addresses);

    expect(model.findOne).toHaveBeenCalledWith({
      deviceId: 'device-id',
      $or: [
        {
          'addresses.eth': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.bnb': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.xlm': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.multi': /^0x3333333333333333333333333333333333333333$/i,
        },
      ],
    });
  });

  it('returns null when the wallet address is not stored on any supported address entry', async () => {
    const model = createModelMock();
    const service = new WalletService(model);

    await expect(
      service.verifyWalletForDevice(
        'device-id',
        '0x3333333333333333333333333333333333333333',
      ),
    ).resolves.toBeNull();

    expect(model.findOne).toHaveBeenCalledWith({
      deviceId: 'device-id',
      $or: [
        {
          'addresses.eth': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.bnb': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.xlm': /^0x3333333333333333333333333333333333333333$/i,
        },
        {
          'addresses.multi': /^0x3333333333333333333333333333333333333333$/i,
        },
      ],
    });
  });

  it('rejects invalid wallet addresses', async () => {
    const service = new WalletService(createModelMock());

    await expect(
      service.verifyWalletForDevice('device-id', 'not-a-wallet'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
