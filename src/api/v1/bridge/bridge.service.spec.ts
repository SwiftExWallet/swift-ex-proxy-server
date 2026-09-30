import { BadRequestException } from '@nestjs/common';
import { BridgeService } from './bridge.service';
import { EvmSourceChain } from './evm/evm-source-chain';
import { BridgeDirection } from './types/bridge-direction.type';
import { BridgeStatus } from './types/bridge-status.type';

describe('BridgeService source-chain routing', () => {
  const evmAddress = '0x4444444444444444444444444444444444444444';
  const stellarAddress = 'G' + 'A'.repeat(55);
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn((_id, patch) =>
      Promise.resolve({ id: 'transfer', ...patch }),
    ),
  };
  const evm = {
    balance: jest.fn().mockResolvedValue(2000000n),
    feeBps: jest.fn().mockResolvedValue(25n),
    allowance: jest.fn().mockResolvedValue(0n),
    prepareApproval: jest.fn().mockResolvedValue({ chainId: '0x14a34' }),
    prepareBridge: jest.fn(),
    verifyApproval: jest.fn(),
    verifyBridge: jest.fn(),
    broadcast: jest.fn(),
    receipt: jest.fn(),
  };
  const stellar = {
    validateAddress: jest.fn(),
    hasUsdcTrustline: jest.fn().mockResolvedValue(true),
    buildHook: jest.fn(),
    forwarderBytes32: jest.fn(),
  };
  const circle = {
    getBurnFee: jest
      .fn()
      .mockResolvedValue({ minimumFee: '1', finalityThreshold: 2000 }),
    getAttestation: jest.fn(),
  };
  const reverse = {
    quote: jest.fn(),
    create: jest.fn(),
    status: jest.fn(),
    submitEvmSignature: jest.fn(),
    submitStellarSignature: jest.fn(),
  };
  const service = new BridgeService(
    repository as any,
    evm as any,
    stellar as any,
    circle as any,
    reverse as any,
  );

  const request = (sourceChain?: EvmSourceChain, fast = false) => ({
    sourceChain,
    evmAddress,
    stellarAddress,
    amount: '1',
    fast,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    evm.balance.mockResolvedValue(2000000n);
    evm.feeBps.mockResolvedValue(25n);
    evm.allowance.mockResolvedValue(0n);
    evm.prepareApproval.mockResolvedValue({ chainId: '0x14a34' });
    stellar.hasUsdcTrustline.mockResolvedValue(true);
    circle.getBurnFee.mockResolvedValue({
      minimumFee: '1',
      finalityThreshold: 2000,
    });
  });

  it('routes a Base quote through Base contracts and Circle domain 6', async () => {
    await expect(
      service.quote(request(EvmSourceChain.BASE_SEPOLIA)),
    ).resolves.toMatchObject({
      sourceChain: EvmSourceChain.BASE_SEPOLIA,
      sourceChainId: 84532,
      finalityThreshold: 2000,
    });
    expect(evm.balance).toHaveBeenCalledWith(
      EvmSourceChain.BASE_SEPOLIA,
      evmAddress,
    );
    expect(evm.feeBps).toHaveBeenCalledWith(EvmSourceChain.BASE_SEPOLIA);
    expect(circle.getBurnFee).toHaveBeenCalledWith(2000, 6);
  });

  it('persists the selected source route snapshot at creation', async () => {
    repository.create.mockImplementation(async (data) => ({
      id: 'transfer',
      direction: BridgeDirection.EVM_TO_STELLAR,
      ...data,
    }));
    await service.create(request(EvmSourceChain.BASE_SEPOLIA));
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChain: EvmSourceChain.BASE_SEPOLIA,
        sourceChainId: 84532,
        sourceDomain: 6,
        sourceUsdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        sourceRouterAddress: '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
        sourceTokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        sourceMessageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
      }),
    );
    expect(evm.allowance).toHaveBeenCalledWith(
      EvmSourceChain.BASE_SEPOLIA,
      evmAddress,
    );
    expect(evm.prepareApproval).toHaveBeenCalledWith(
      EvmSourceChain.BASE_SEPOLIA,
      evmAddress,
      1002500n,
    );
  });

  it('uses the persisted source for receipt recovery', async () => {
    repository.findById
      .mockResolvedValueOnce({
        id: 'transfer',
        direction: BridgeDirection.EVM_TO_STELLAR,
      })
      .mockResolvedValueOnce({
        id: 'transfer',
        direction: BridgeDirection.EVM_TO_STELLAR,
        sourceChain: EvmSourceChain.ARBITRUM_SEPOLIA,
        status: BridgeStatus.SOURCE_PENDING,
        sourceTxHash: '0xsource',
      });
    evm.receipt.mockResolvedValue({ status: 1 });
    await expect(service.getStatus('transfer')).resolves.toMatchObject({
      status: BridgeStatus.ATTESTATION_PENDING,
    });
    expect(evm.receipt).toHaveBeenCalledWith(
      EvmSourceChain.ARBITRUM_SEPOLIA,
      '0xsource',
    );
  });

  it('recovers a legacy forward transfer as Sepolia', async () => {
    repository.findById
      .mockResolvedValueOnce({ id: 'transfer' })
      .mockResolvedValueOnce({
        id: 'transfer',
        status: BridgeStatus.SOURCE_PENDING,
        sourceTxHash: '0xsource',
      });
    evm.receipt.mockResolvedValue({ status: 1 });
    await service.getStatus('transfer');
    expect(evm.receipt).toHaveBeenCalledWith(
      EvmSourceChain.SEPOLIA,
      '0xsource',
    );
  });

  it('rejects recovery when the persisted source route snapshot no longer matches', async () => {
    repository.findById
      .mockResolvedValueOnce({ id: 'transfer' })
      .mockResolvedValueOnce({
        id: 'transfer',
        sourceChain: EvmSourceChain.BASE_SEPOLIA,
        sourceChainId: 84532,
        sourceRouterAddress: '0x1111111111111111111111111111111111111111',
        status: BridgeStatus.SOURCE_PENDING,
        sourceTxHash: '0xsource',
      });
    await expect(service.getStatus('transfer')).rejects.toThrow(
      'Bridge source route snapshot changed',
    );
    expect(evm.receipt).not.toHaveBeenCalled();
  });

  it('rejects Fuji fast transfer before calling RPC or Circle', async () => {
    await expect(
      service.quote(request(EvmSourceChain.AVALANCHE_FUJI, true)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(evm.balance).not.toHaveBeenCalled();
    expect(circle.getBurnFee).not.toHaveBeenCalled();
  });

  it('routes Fuji standard transfer through domain 1 at finality 2000', async () => {
    await expect(
      service.quote(request(EvmSourceChain.AVALANCHE_FUJI)),
    ).resolves.toMatchObject({
      sourceChain: EvmSourceChain.AVALANCHE_FUJI,
      sourceChainId: 43113,
      finalityThreshold: 2000,
    });
    expect(circle.getBurnFee).toHaveBeenCalledWith(2000, 1);
  });

  it('rejects a non-Sepolia sourceChain on the reverse direction', async () => {
    await expect(
      service.quote({
        ...request(EvmSourceChain.BASE_SEPOLIA),
        direction: BridgeDirection.STELLAR_TO_EVM,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reverse.quote).not.toHaveBeenCalled();
  });

  it('routes Stellar source status recovery to the reverse orchestrator', async () => {
    repository.findById.mockResolvedValue({
      id: 'transfer',
      direction: BridgeDirection.STELLAR_TO_EVM,
    });
    reverse.status.mockResolvedValue({
      id: 'transfer',
      status: BridgeStatus.ATTESTATION_PENDING,
    });
    await expect(service.getStatus('transfer')).resolves.toMatchObject({
      status: BridgeStatus.ATTESTATION_PENDING,
    });
    expect(reverse.status).toHaveBeenCalledWith('transfer');
  });

  it('calculates fractional Circle fees with the existing 20 percent buffer', () => {
    expect(service.calculateQuote(100000000n, 25n, '1.3', true)).toEqual({
      protocolFee: 250000n,
      maxFee: 15600n,
      minimumReceived: 99734400n,
    });
  });
});
