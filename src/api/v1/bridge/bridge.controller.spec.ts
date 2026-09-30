import { ForbiddenException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { BridgeController } from './bridge.controller';
import { BridgeDirection } from './types/bridge-direction.type';

describe('BridgeController wallet ownership', () => {
  const stellarAddress = Keypair.fromRawEd25519Seed(
    Buffer.alloc(32, 6),
  ).publicKey();
  const evmAddress = '0x4444444444444444444444444444444444444444';
  const bridge = {
    quote: jest.fn((body) => Promise.resolve(body)),
    create: jest.fn((body) => Promise.resolve(body)),
    assertAccess: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn(),
    submitEvmSignature: jest.fn(),
    submitStellarSignature: jest.fn(),
  };
  const controller = new BridgeController(bridge as any);

  beforeEach(() => jest.clearAllMocks());

  it('authenticates a Stellar source quote against the verified XLM wallet', async () => {
    const body = {
      direction: BridgeDirection.STELLAR_TO_EVM,
      stellarAddress,
      evmAddress,
      amount: '1',
      fast: false,
    };
    await expect(
      controller.quote(
        { wallet: { xlm: stellarAddress, multi: evmAddress } },
        body,
      ),
    ).resolves.toEqual(body);
  });

  it('allows a source quote without an auth token', async () => {
    const body = {
      direction: BridgeDirection.EVM_TO_STELLAR,
      stellarAddress,
      evmAddress,
      amount: '1',
      fast: false,
    };

    await expect(controller.quote({}, body)).resolves.toEqual(body);
  });

  it('rejects a Stellar source address outside the verified wallet', () => {
    expect(() =>
      controller.quote(
        { wallet: { xlm: Keypair.random().publicKey(), multi: evmAddress } },
        {
          direction: BridgeDirection.STELLAR_TO_EVM,
          stellarAddress,
          evmAddress,
          amount: '1',
          fast: false,
        },
      ),
    ).toThrow(ForbiddenException);
  });

  it('checks transfer ownership before returning status', async () => {
    bridge.getStatus.mockResolvedValue({ id: 'transfer' });
    await controller.status({ wallet: { xlm: stellarAddress } }, 'transfer');
    expect(bridge.assertAccess).toHaveBeenCalledWith('transfer', {
      xlm: stellarAddress,
    });
    expect(bridge.getStatus).toHaveBeenCalledWith('transfer');
  });

  it('allows status polling without an auth token', async () => {
    bridge.getStatus.mockResolvedValue({ id: 'transfer' });

    await controller.status({}, 'transfer');

    expect(bridge.assertAccess).toHaveBeenCalledWith('transfer', undefined);
    expect(bridge.getStatus).toHaveBeenCalledWith('transfer');
  });
});
