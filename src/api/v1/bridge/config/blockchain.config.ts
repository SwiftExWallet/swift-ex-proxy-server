import { registerAs } from '@nestjs/config';

export default registerAs('blockchain', () => ({
  evm: {
    chainId: Number(process.env.EVM_CHAIN_ID),
    rpcUrl: process.env.EVM_RPC_URL,
    usdcAddress: process.env.EVM_USDC_ADDRESS,
    routerAddress: process.env.EVM_ROUTER_ADDRESS,
    tokenMessengerAddress: process.env.EVM_TOKEN_MESSENGER_V2_ADDRESS,
    messageTransmitterAddress: process.env.EVM_MESSAGE_TRANSMITTER_V2_ADDRESS,
    sources: {
      sepolia: { rpcUrl: process.env.PROVIDER_RPC_ETH_1 },
      arbitrum_sepolia: {
        rpcUrl: process.env.PROVIDER_RPC_ARB_1,
      },
      base_sepolia: { rpcUrl: process.env.PROVIDER_RPC_BASE_1 },
      optimism_sepolia: {
        rpcUrl: process.env.PROVIDER_RPC_OPT_1,
      },
      avalanche_fuji: {
        rpcUrl: process.env.PROVIDER_RPC_AVAX_1,
      },
    },
  },
  circle: {
    irisUrl: process.env.CIRCLE_IRIS_URL,
    sourceDomain: Number(process.env.CIRCLE_SOURCE_DOMAIN),
    destinationDomain: Number(process.env.CIRCLE_DESTINATION_DOMAIN),
  },
  stellar: {
    network: process.env.STELLAR_NETWORK,
    horizonUrl: process.env.STELLAR_HORIZON_URL,
    rpcUrl: process.env.STELLAR_RPC_URL,
    forwarderAddress: process.env.STELLAR_FORWARDER_ADDRESS,
    usdcIssuer: process.env.STELLAR_USDC_ISSUER,
    tokenMessengerAddress: process.env.STELLAR_TOKEN_MESSENGER_V2_ADDRESS,
    messageTransmitterAddress:
      process.env.STELLAR_MESSAGE_TRANSMITTER_V2_ADDRESS,
    swiftExRouterAddress: process.env.STELLAR_SWIFTEX_ROUTER_ADDRESS,
    treasuryAddress: process.env.STELLAR_BRIDGE_TREASURY_ADDRESS,
  },
}));
