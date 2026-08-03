jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  Contract: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { Contract, ZeroAddress } from 'ethers';
import { ChainId } from '../enums/chain.enum';
import { TokenMetadataService } from './tokenMetadata.service';

describe('TokenMetadataService', () => {
  let service: TokenMetadataService;
  const providerService = {
    getProvider: jest.fn(),
    getProviderForChainId: jest.fn(),
  };
  const redisService = {
    getKey: jest.fn(),
    setKey: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Contract as unknown as jest.Mock).mockReset();
    providerService.getProvider.mockReturnValue({});
    providerService.getProviderForChainId.mockReturnValue({});
    redisService.getKey.mockResolvedValue(null);
    service = new TokenMetadataService(
      providerService as any,
      redisService as any,
    );
  });

  it('adds native token metadata server-side', async () => {
    const normalized = await service.normalizeSwapQuote({
      tokenIn: {
        address: ZeroAddress,
        chainId: ChainId.ETH,
      },
      tokenOut: {
        address: ZeroAddress,
        chainId: ChainId.ETH,
      },
      amount: '1',
      recipient: '0x1234567890123456789012345678901234567890',
    });

    expect(normalized.tokenIn.symbol).toBe('ETH');
    expect(normalized.tokenIn.decimals).toBe('18');
    expect(normalized.tokenOut.symbol).toBe('ETH');
    expect(normalized.tokenOut.decimals).toBe('18');
  });

  it('adds token metadata from the chain token catalog', async () => {
    const token = await service.resolveToken({
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      chainId: ChainId.POL,
    });

    expect(token).toEqual({
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      chainId: ChainId.POL,
      symbol: 'USDC',
      decimals: '6',
    });
    expect(redisService.getKey).not.toHaveBeenCalled();
    expect(providerService.getProvider).not.toHaveBeenCalled();
  });

  it('loads token metadata from the matching chain token catalog', async () => {
    const token = await service.resolveToken({
      address: '0x55d398326f99059fF775485246999027B3197955',
      chainId: ChainId.BSC,
    });

    expect(token).toEqual({
      address: '0x55d398326f99059fF775485246999027B3197955',
      chainId: ChainId.BSC,
      symbol: 'USDT',
      decimals: '18',
    });
    expect(redisService.getKey).not.toHaveBeenCalled();
    expect(providerService.getProvider).not.toHaveBeenCalled();
  });

  it('loads token metadata from the chain 138 token catalog', async () => {
    const token = await service.resolveToken({
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      chainId: 138,
    });

    expect(token).toEqual({
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      chainId: 138,
      symbol: 'USDT',
      decimals: '6',
    });
    expect(redisService.getKey).not.toHaveBeenCalled();
    expect(providerService.getProviderForChainId).not.toHaveBeenCalled();
  });

  it('adds fallback token metadata from Redis cache by address', async () => {
    const address = '0x4444444444444444444444444444444444444444';
    redisService.getKey.mockResolvedValue(
      JSON.stringify({ symbol: 'CACHE', decimals: '8' }),
    );

    const token = await service.resolveToken({
      address,
      chainId: ChainId.ETH,
    });

    expect(token).toEqual({
      address,
      chainId: ChainId.ETH,
      symbol: 'CACHE',
      decimals: '8',
    });
    expect(redisService.getKey).toHaveBeenCalledWith(
      `${ChainId.ETH}:${address.toLowerCase()}`,
    );
    expect(providerService.getProvider).not.toHaveBeenCalled();
  });

  it('caches fallback token metadata in Redis by address', async () => {
    const address = '0x5555555555555555555555555555555555555555';
    (Contract as unknown as jest.Mock).mockImplementation(() => ({
      symbol: jest.fn().mockResolvedValue('LIVE'),
      decimals: jest.fn().mockResolvedValue(9),
    }));

    const token = await service.resolveToken({
      address,
      chainId: ChainId.ETH,
    });

    expect(token).toEqual({
      address,
      chainId: ChainId.ETH,
      symbol: 'LIVE',
      decimals: '9',
    });
    expect(redisService.setKey).toHaveBeenCalledWith(
      `${ChainId.ETH}:${address.toLowerCase()}`,
      JSON.stringify({ symbol: 'LIVE', decimals: '9' }),
    );
  });

  it('falls back to smart contract metadata for supported chains when token is not in catalog', async () => {
    const address = '0x6666666666666666666666666666666666666666';
    (Contract as unknown as jest.Mock).mockImplementation(() => ({
      symbol: jest.fn().mockResolvedValue('ANY'),
      decimals: jest.fn().mockResolvedValue(12),
    }));

    const token = await service.resolveToken({
      address,
      chainId: 138,
    });

    expect(token).toEqual({
      address,
      chainId: 138,
      symbol: 'ANY',
      decimals: '12',
    });
    expect(providerService.getProviderForChainId).toHaveBeenCalledWith(138);
    expect(redisService.setKey).toHaveBeenCalledWith(
      `138:${address.toLowerCase()}`,
      JSON.stringify({ symbol: 'ANY', decimals: '12' }),
    );
  });

  it('ignores client supplied token metadata when resolving tokens', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    redisService.getKey.mockResolvedValue(
      JSON.stringify({ symbol: 'USDC', decimals: '6' }),
    );

    const token = await service.resolveToken({
      address,
      chainId: ChainId.ETH,
      symbol: 'FAKE',
      decimals: '99',
    } as any);

    expect(token).toEqual({
      address,
      chainId: ChainId.ETH,
      symbol: 'USDC',
      decimals: '6',
    });
  });

  it('rejects unsupported token chains before fallback lookups', async () => {
    await expect(
      service.resolveToken({
        address: '0x7777777777777777777777777777777777777777',
        chainId: 84113,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(redisService.getKey).not.toHaveBeenCalled();
    expect(providerService.getProviderForChainId).not.toHaveBeenCalled();
  });
});
