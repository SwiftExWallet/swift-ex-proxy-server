import {
  getErc20ContractInfo,
  getPool,
  getPoolContractFee,
  quoteExactInputSingle,
} from './contractUtilityMethod';

describe('contractUtilityMethod helpers', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('gets ERC20 contract metadata and balance', async () => {
    const tokenContract = {
      name: jest.fn().mockResolvedValue('USD Coin'),
      symbol: jest.fn().mockResolvedValue('USDC'),
      decimals: jest.fn().mockResolvedValue(6),
      balanceOf: jest.fn().mockResolvedValue(123n),
    };

    await expect(
      getErc20ContractInfo(tokenContract as any, '0xwallet'),
    ).resolves.toEqual({
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      balance: 123n,
    });
    expect(tokenContract.name).toHaveBeenCalledTimes(1);
    expect(tokenContract.symbol).toHaveBeenCalledTimes(1);
    expect(tokenContract.decimals).toHaveBeenCalledTimes(1);
    expect(tokenContract.balanceOf).toHaveBeenCalledWith('0xwallet');
  });

  it('gets a pool using the configured fee tier', async () => {
    process.env = {
      ...originalEnv,
      FEE_TIER: '3000',
    };
    const factoryContract = {
      getPool: jest.fn().mockResolvedValue('0xpool'),
    };

    await expect(
      getPool(factoryContract as any, '0xtokenIn', '0xtokenOut'),
    ).resolves.toBe('0xpool');
    expect(factoryContract.getPool).toHaveBeenCalledWith(
      '0xtokenIn',
      '0xtokenOut',
      '3000',
    );
  });

  it('gets pool fee from the pool contract', async () => {
    const poolContract = {
      fee: jest.fn().mockResolvedValue(3000n),
    };

    await expect(getPoolContractFee(poolContract as any)).resolves.toBe(3000n);
    expect(poolContract.fee).toHaveBeenCalledTimes(1);
  });

  it('quotes exact input single with sqrt price limit set to zero', async () => {
    const quotedOutput = {
      amountOut: 123n,
      sqrtPriceX96After: 456n,
      initializedTicksCrossed: 1n,
      gasEstimate: 789n,
    };
    const quoterContract = {
      quoteExactInputSingle: jest.fn().mockResolvedValue(quotedOutput),
    };

    await expect(
      quoteExactInputSingle(
        quoterContract as any,
        '0xtokenIn',
        '0xtokenOut',
        3000n,
        100n,
      ),
    ).resolves.toBe(quotedOutput);
    expect(quoterContract.quoteExactInputSingle).toHaveBeenCalledWith({
      tokenIn: '0xtokenIn',
      tokenOut: '0xtokenOut',
      fee: 3000n,
      amountIn: 100n,
      sqrtPriceLimitX96: 0n,
    });
  });
});
