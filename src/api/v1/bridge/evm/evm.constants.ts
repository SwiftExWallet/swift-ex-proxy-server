export const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];

export const ROUTER_ABI = [
  'function feeBps() view returns (uint16)',
  'function bridgeToStellar(uint256,bytes32,bytes,uint256,uint32,uint16)',
];

export const MESSAGE_TRANSMITTER_V2_ABI = [
  'function receiveMessage(bytes message,bytes attestation) returns (bool)',
  'function usedNonces(bytes32 nonce) view returns (uint256)',
];
