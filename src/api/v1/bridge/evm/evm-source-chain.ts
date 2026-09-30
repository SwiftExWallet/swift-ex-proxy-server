import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum EvmSourceChain {
  SEPOLIA = 'sepolia',
  ARBITRUM_SEPOLIA = 'arbitrum_sepolia',
  BASE_SEPOLIA = 'base_sepolia',
  OPTIMISM_SEPOLIA = 'optimism_sepolia',
  AVALANCHE_FUJI = 'avalanche_fuji',
}

export interface EvmSourceChainConfig {
  key: EvmSourceChain;
  chainId: number;
  circleDomain: number;
  rpcUrl: string;
  usdcAddress: string;
  routerAddress: string;
  tokenMessengerAddress: string;
  messageTransmitterAddress: string;
  supportsFastTransfer: boolean;
}

export type EvmSourceChainDescriptor = Omit<EvmSourceChainConfig, 'rpcUrl'>;
type StaticSourceConfig = Omit<EvmSourceChainDescriptor, 'key'>;

const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';

const source = (
  chainId: number,
  circleDomain: number,
  usdcAddress: string,
  routerAddress: string,
  supportsFastTransfer: boolean,
): StaticSourceConfig => ({
  chainId,
  circleDomain,
  usdcAddress,
  routerAddress,
  tokenMessengerAddress: TOKEN_MESSENGER_V2,
  messageTransmitterAddress: MESSAGE_TRANSMITTER_V2,
  supportsFastTransfer,
});

const EVM_SOURCE_CONFIGS: Record<EvmSourceChain, StaticSourceConfig> = {
  [EvmSourceChain.SEPOLIA]: source(
    11155111,
    0,
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    '0x6DA5BDB2f9CA2d601D588FE924eb2A58F38E84a2',
    true,
  ),
  [EvmSourceChain.ARBITRUM_SEPOLIA]: source(
    421614,
    3,
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    '0xd55f161E5D9d2Bd9B06ec3ECFA3aB65ed495Ab16',
    true,
  ),
  [EvmSourceChain.BASE_SEPOLIA]: source(
    84532,
    6,
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
    true,
  ),
  [EvmSourceChain.OPTIMISM_SEPOLIA]: source(
    11155420,
    2,
    '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
    true,
  ),
  [EvmSourceChain.AVALANCHE_FUJI]: source(
    43113,
    1,
    '0x5425890298aed601595a70AB815c96711a31Bc65',
    '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
    false,
  ),
};

export function resolveEvmSourceChain(
  config: ConfigService,
  sourceChain: EvmSourceChain = EvmSourceChain.SEPOLIA,
): EvmSourceChainConfig {
  const descriptor = getEvmSourceChainDescriptor(sourceChain);
  const configuredRpc = config.get<string>(
    `blockchain.evm.sources.${sourceChain}.rpcUrl`,
  );
  const legacyRpc =
    sourceChain === EvmSourceChain.SEPOLIA
      ? config.get<string>('blockchain.evm.rpcUrl')
      : undefined;
  return {
    ...descriptor,
    rpcUrl: configuredRpc || legacyRpc || '',
  };
}

export function getEvmSourceChainDescriptor(
  sourceChain: EvmSourceChain = EvmSourceChain.SEPOLIA,
): EvmSourceChainDescriptor {
  const descriptor = EVM_SOURCE_CONFIGS[sourceChain];
  if (!descriptor) {
    throw new BadRequestException('Unsupported EVM bridge source chain');
  }

  return {
    key: sourceChain,
    ...descriptor,
  };
}
