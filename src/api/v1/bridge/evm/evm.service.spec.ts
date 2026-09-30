import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transaction, Wallet } from 'ethers';
import { EvmService } from './evm.service';
import { EvmSourceChain, resolveEvmSourceChain } from './evm-source-chain';

const wallet = new Wallet('0x' + '01'.repeat(32));
const sepoliaToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const sepoliaRouter = '0x6DA5BDB2f9CA2d601D588FE924eb2A58F38E84a2';
const baseToken = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const baseRouter = '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639';
const config = new ConfigService({
  blockchain: {
    evm: {
      sources: {
        sepolia: { rpcUrl: 'https://sepolia.example.invalid' },
        base_sepolia: { rpcUrl: 'https://base.example.invalid' },
      },
    },
  },
});

describe('Bridge EVM signing and source routing', () => {
  let service: EvmService;
  const baseTx = {
    nonce: 3,
    gasPrice: 10n,
    gasLimit: 100000n,
    value: 0,
    type: 0,
  };

  beforeEach(() => {
    service = new EvmService(config);
  });

  afterEach(() => service.onModuleDestroy());

  it('does not request a mint transaction when the Sepolia nonce is consumed', async () => {
    jest.spyOn(service, 'isMessageReceived').mockResolvedValue(true);
    expect(
      await service.prepareMint(
        wallet.address,
        '0xab',
        '0xcd',
        '0x' + '11'.repeat(32),
      ),
    ).toBeNull();
  });

  it('does not prepare a transaction after failed receiveMessage simulation', async () => {
    jest.spyOn(service, 'isMessageReceived').mockResolvedValue(false);
    jest
      .spyOn(service, 'simulateMint')
      .mockRejectedValue(new Error('simulation reverted'));
    await expect(
      service.prepareMint(
        wallet.address,
        '0xab',
        '0xcd',
        '0x' + '11'.repeat(32),
      ),
    ).rejects.toThrow('simulation reverted');
  });

  it.each([
    [EvmSourceChain.SEPOLIA, 11155111, sepoliaToken, sepoliaRouter],
    [EvmSourceChain.BASE_SEPOLIA, 84532, baseToken, baseRouter],
  ])(
    'accepts an exact %s approval signed by the transfer owner',
    async (sourceChain, chainId, token, router) => {
      const signed = await wallet.signTransaction({
        ...baseTx,
        chainId,
        to: token,
        data: service.tokenInterface.encodeFunctionData('approve', [
          router,
          1000000n,
        ]),
      });
      expect(
        service.verifyApproval(sourceChain, signed, wallet.address, 1000000n)
          .hash,
      ).toBe(Transaction.from(signed).hash);
    },
  );

  it.each(['chain', 'spender', 'amount', 'value', 'signer'])(
    'rejects a Base approval with changed %s',
    async (changed) => {
      const signed = await wallet.signTransaction({
        ...baseTx,
        chainId: changed === 'chain' ? 11155111 : 84532,
        value: changed === 'value' ? 1 : 0,
        to: baseToken,
        data: service.tokenInterface.encodeFunctionData('approve', [
          changed === 'spender' ? sepoliaRouter : baseRouter,
          changed === 'amount' ? 2n : 1000000n,
        ]),
      });
      expect(() =>
        service.verifyApproval(
          EvmSourceChain.BASE_SEPOLIA,
          signed,
          changed === 'signer' ? baseToken : wallet.address,
          1000000n,
        ),
      ).toThrow();
    },
  );

  it('rejects a bridge transaction sent to another source router', async () => {
    const forwarder = '0x' + 'ab'.repeat(32);
    const signed = await wallet.signTransaction({
      ...baseTx,
      chainId: 84532,
      to: sepoliaRouter,
      data: service.routerInterface.encodeFunctionData('bridgeToStellar', [
        1000000n,
        forwarder,
        '0xab',
        1000n,
        1000,
        25,
      ]),
    });
    expect(() =>
      service.verifyBridge(
        EvmSourceChain.BASE_SEPOLIA,
        signed,
        wallet.address,
        {
          amount: 1000000n,
          forwarder,
          hook: '0xab',
          maxFee: 1000n,
          finalityThreshold: 1000,
          userMaxFeeBps: 25,
        },
      ),
    ).toThrow();
  });

  it('routes contract reads to isolated chain contexts', async () => {
    const sepoliaContext = {
      config: resolveEvmSourceChain(config, EvmSourceChain.SEPOLIA),
      provider: { destroy: jest.fn() },
      token: { balanceOf: jest.fn().mockResolvedValue(11n) },
      router: { feeBps: jest.fn().mockResolvedValue(12n) },
      transmitter: {},
    };
    const baseContext = {
      config: resolveEvmSourceChain(config, EvmSourceChain.BASE_SEPOLIA),
      provider: { destroy: jest.fn() },
      token: { balanceOf: jest.fn().mockResolvedValue(21n) },
      router: { feeBps: jest.fn().mockResolvedValue(22n) },
      transmitter: {},
    };
    (service as any).contexts.set(EvmSourceChain.SEPOLIA, sepoliaContext);
    (service as any).contexts.set(EvmSourceChain.BASE_SEPOLIA, baseContext);

    await expect(
      service.balance(EvmSourceChain.SEPOLIA, wallet.address),
    ).resolves.toBe(11n);
    await expect(
      service.balance(EvmSourceChain.BASE_SEPOLIA, wallet.address),
    ).resolves.toBe(21n);
    await expect(service.feeBps(EvmSourceChain.BASE_SEPOLIA)).resolves.toBe(
      22n,
    );
  });

  it('rejects a selected chain whose RPC is missing', async () => {
    await expect(
      service.balance(EvmSourceChain.ARBITRUM_SEPOLIA, wallet.address),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects transaction building when the selected RPC reports another chain', async () => {
    const context = {
      config: resolveEvmSourceChain(config, EvmSourceChain.BASE_SEPOLIA),
      provider: {
        getNetwork: jest.fn().mockResolvedValue({ chainId: 11155111n }),
        getTransactionCount: jest.fn().mockResolvedValue(1),
        getFeeData: jest.fn().mockResolvedValue({ gasPrice: 10n }),
        estimateGas: jest.fn().mockResolvedValue(100000n),
        getBalance: jest.fn().mockResolvedValue(10000000n),
        destroy: jest.fn(),
      },
      token: {},
      router: {},
      transmitter: {},
    };
    (service as any).contexts.set(EvmSourceChain.BASE_SEPOLIA, context);
    await expect(
      service.buildTransaction(
        EvmSourceChain.BASE_SEPOLIA,
        wallet.address,
        baseRouter,
        '0x1234',
      ),
    ).rejects.toThrow('Configured RPC has wrong chainId');
  });

  it('reuses one context per chain and destroys every cached provider', () => {
    const first = (service as any).getContext(EvmSourceChain.SEPOLIA);
    const second = (service as any).getContext(EvmSourceChain.SEPOLIA);
    const base = (service as any).getContext(EvmSourceChain.BASE_SEPOLIA);
    expect(second).toBe(first);
    expect(base).not.toBe(first);
    const destroy = [
      jest.spyOn(first.provider, 'destroy'),
      jest.spyOn(base.provider, 'destroy'),
    ];
    service.onModuleDestroy();
    expect(destroy[0]).toHaveBeenCalledTimes(1);
    expect(destroy[1]).toHaveBeenCalledTimes(1);
    (service as any).contexts.clear();
  });
});
