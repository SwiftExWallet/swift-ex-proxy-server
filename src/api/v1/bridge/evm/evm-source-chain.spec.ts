import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { BridgeQuoteDto } from '../dto/bridge-quote.dto';
import {
  EvmSourceChain,
  resolveEvmSourceChain,
} from './evm-source-chain';

describe('EVM to Stellar source chains', () => {
  const rpcUrls: Record<EvmSourceChain, string> = {
    [EvmSourceChain.SEPOLIA]: 'https://sepolia.rpc.invalid',
    [EvmSourceChain.ARBITRUM_SEPOLIA]: 'https://arbitrum.rpc.invalid',
    [EvmSourceChain.BASE_SEPOLIA]: 'https://base.rpc.invalid',
    [EvmSourceChain.OPTIMISM_SEPOLIA]: 'https://optimism.rpc.invalid',
    [EvmSourceChain.AVALANCHE_FUJI]: 'https://avalanche.rpc.invalid',
  };
  const config = new ConfigService({
    blockchain: {
      evm: {
        sources: Object.fromEntries(
          Object.entries(rpcUrls).map(([key, rpcUrl]) => [key, { rpcUrl }]),
        ),
      },
    },
  });

  it.each([
    [
      EvmSourceChain.SEPOLIA,
      11155111,
      0,
      '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      '0x6DA5BDB2f9CA2d601D588FE924eb2A58F38E84a2',
      true,
    ],
    [
      EvmSourceChain.ARBITRUM_SEPOLIA,
      421614,
      3,
      '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      '0xd55f161E5D9d2Bd9B06ec3ECFA3aB65ed495Ab16',
      true,
    ],
    [
      EvmSourceChain.BASE_SEPOLIA,
      84532,
      6,
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
      true,
    ],
    [
      EvmSourceChain.OPTIMISM_SEPOLIA,
      11155420,
      2,
      '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
      true,
    ],
    [
      EvmSourceChain.AVALANCHE_FUJI,
      43113,
      1,
      '0x5425890298aed601595a70AB815c96711a31Bc65',
      '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
      false,
    ],
  ])(
    'resolves %s to its chain, Circle, token, and router configuration',
    (key, chainId, circleDomain, usdcAddress, routerAddress, supportsFast) => {
      expect(resolveEvmSourceChain(config, key)).toEqual({
        key,
        chainId,
        circleDomain,
        rpcUrl: rpcUrls[key],
        usdcAddress,
        routerAddress,
        tokenMessengerAddress:
          '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitterAddress:
          '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        supportsFastTransfer: supportsFast,
      });
    },
  );

  it('defaults missing sourceChain to Sepolia and supports the legacy RPC', () => {
    const legacy = new ConfigService({
      blockchain: { evm: { rpcUrl: 'https://legacy.rpc.invalid' } },
    });
    expect(resolveEvmSourceChain(legacy)).toMatchObject({
      key: EvmSourceChain.SEPOLIA,
      chainId: 11155111,
      rpcUrl: 'https://legacy.rpc.invalid',
    });
  });

  it('uses the deployed V2 Sepolia router instead of the legacy router override', () => {
    const config = new ConfigService({
      blockchain: {
        evm: {
          routerAddress: '0xB81fBd73C129d047806c2F1b6538359430E2990f',
        },
      },
    });
    process.env.EVM_ROUTER_ADDRESS =
      '0xB81fBd73C129d047806c2F1b6538359430E2990f';
    try {
      expect(resolveEvmSourceChain(config).routerAddress).toBe(
        '0x6DA5BDB2f9CA2d601D588FE924eb2A58F38E84a2',
      );
    } finally {
      delete process.env.EVM_ROUTER_ADDRESS;
    }
  });

  it('rejects an unknown runtime source chain', () => {
    expect(() => resolveEvmSourceChain(config, 'base' as EvmSourceChain)).toThrow(
      BadRequestException,
    );
  });

  it('accepts only the five exact sourceChain values in bridge DTOs', async () => {
    for (const sourceChain of Object.values(EvmSourceChain)) {
      const dto = Object.assign(new BridgeQuoteDto(), {
        sourceChain,
        evmAddress: '0x4444444444444444444444444444444444444444',
        stellarAddress: 'G' + 'A'.repeat(55),
        amount: '1',
        fast: false,
      });
      expect(await validate(dto)).toEqual([]);
    }

    const invalid = Object.assign(new BridgeQuoteDto(), {
      sourceChain: 'base',
      evmAddress: '0x4444444444444444444444444444444444444444',
      stellarAddress: 'G' + 'A'.repeat(55),
      amount: '1',
      fast: false,
    });
    expect((await validate(invalid)).map((error) => error.property)).toContain(
      'sourceChain',
    );
  });
});
