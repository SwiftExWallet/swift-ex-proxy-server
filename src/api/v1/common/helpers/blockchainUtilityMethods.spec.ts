import { ETH_ERC20_ABI } from '../abi/eth';
import {
  broadcastTransactionToNetwork,
  getErc20ContractTokenBalance,
  getEstimateGas,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from './blockchainUtilityMethods';

const mockContractFactory = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');

  return {
    ...actual,
    Contract: jest
      .fn()
      .mockImplementation((...args) => mockContractFactory(...args)),
  };
});

describe('blockchainUtilityMethods', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PROVIDER_RETRY_MAX_ATTEMPTS: '1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    mockContractFactory.mockReset();
  });

  it('broadcasts a signed transaction through the provider', async () => {
    const txResponse = { hash: '0xhash' };
    const provider = {
      broadcastTransaction: jest.fn().mockResolvedValue(txResponse),
    };

    await expect(
      broadcastTransactionToNetwork(provider as any, '0xsigned'),
    ).resolves.toBe(txResponse);
    expect(provider.broadcastTransaction).toHaveBeenCalledWith('0xsigned');
  });

  it('gets transaction count through the provider', async () => {
    const provider = {
      getTransactionCount: jest.fn().mockResolvedValue(7),
    };

    await expect(
      getTransactionCount(provider as any, '0xwallet'),
    ).resolves.toBe(7);
    expect(provider.getTransactionCount).toHaveBeenCalledWith('0xwallet');
  });

  it('gets fee data through the provider', async () => {
    const feeData = { gasPrice: 1n };
    const provider = {
      getFeeData: jest.fn().mockResolvedValue(feeData),
    };

    await expect(getFeeData(provider as any)).resolves.toBe(feeData);
    expect(provider.getFeeData).toHaveBeenCalledTimes(1);
  });

  it('gets network through the provider', async () => {
    const network = { chainId: 1n, name: 'mainnet' };
    const provider = {
      getNetwork: jest.fn().mockResolvedValue(network),
    };

    await expect(getNetwork(provider as any)).resolves.toBe(network);
    expect(provider.getNetwork).toHaveBeenCalledTimes(1);
  });

  it('gets ERC20 token balance using a contract instance', async () => {
    const tokenContract = {
      balanceOf: jest.fn().mockResolvedValue(123n),
    };
    const provider = {};
    mockContractFactory.mockReturnValue(tokenContract);

    await expect(
      getErc20ContractTokenBalance('0xtoken', '0xwallet', provider as any),
    ).resolves.toBe(123n);
    expect(mockContractFactory).toHaveBeenCalledWith(
      '0xtoken',
      ETH_ERC20_ABI,
      provider,
    );
    expect(tokenContract.balanceOf).toHaveBeenCalledWith('0xwallet');
  });

  it('gets native currency balance through the provider', async () => {
    const provider = {
      getBalance: jest.fn().mockResolvedValue(456n),
    };

    await expect(
      getNativeCurrencyBalance('0xwallet', provider as any),
    ).resolves.toBe(456n);
    expect(provider.getBalance).toHaveBeenCalledWith('0xwallet');
  });

  it('estimates gas using the expected transaction shape', async () => {
    const provider = {
      estimateGas: jest.fn().mockResolvedValue(21000n),
    };

    await expect(
      getEstimateGas(provider as any, '0xwallet', {
        to: '0xto',
        data: '0xdata',
        value: 123n,
      }),
    ).resolves.toBe(21000n);
    expect(provider.estimateGas).toHaveBeenCalledWith({
      data: '0xdata',
      from: '0xwallet',
      to: '0xto',
      value: 123n,
    });
  });

  it('defaults gas estimate value to 0x0 when unsignedTx has no value', async () => {
    const provider = {
      estimateGas: jest.fn().mockResolvedValue(21000n),
    };

    await getEstimateGas(provider as any, '0xwallet', {
      to: '0xto',
      data: '0xdata',
    });

    expect(provider.estimateGas).toHaveBeenCalledWith({
      data: '0xdata',
      from: '0xwallet',
      to: '0xto',
      value: '0x0',
    });
  });

  it('rethrows gas estimation errors', async () => {
    const error = new Error('estimate failed');
    const provider = {
      estimateGas: jest.fn().mockRejectedValue(error),
    };
    jest.spyOn(console, 'error').mockImplementation();

    await expect(
      getEstimateGas(provider as any, '0xwallet', {
        to: '0xto',
        data: '0xdata',
      }),
    ).rejects.toBe(error);
    expect(console.error).toHaveBeenCalledWith(
      'Gas estimation error details:',
      error,
    );
  });
});
