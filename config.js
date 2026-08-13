// config.js — BNB Agent Marketplace constants
'use strict';

module.exports = {
  // BSC mainnet
  chainId: 56,
  eip155: 'eip155:56',

  // Public RPC (verified working: bsc-rpc.publicnode.com)
  rpc: process.env.BSC_RPC || 'https://bsc-rpc.publicnode.com',

  // ERC-8004 registries on BSC mainnet
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',

  // EIP-7201 storage slot for IdentityRegistryStorage._lastId
  // keccak256(abi.encode(uint256(keccak256("erc8004.identity.registry")) - 1)) & ~bytes32(0xff)
  lastIdSlot: '0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00',

  // b402 (Binance x402) facilitator
  b402Facilitator: process.env.BNB_FACILITATOR_URL || 'https://facilitator.b402.ai',
  bnbNetwork: process.env.BNB_NETWORK || 'bsc-testnet', // testnet=97, mainnet=56
  bnbPayTo: process.env.BNB_PAY_TO || '0x1af8369db07255cd2fd394b8b59926b59b58f92b',
  // USDT on BSC mainnet / testnet
  usdtMainnet: '0x55d398326f99059fF775485246999027B3197955',
  usdtTestnet: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',

  // IPFS gateways for ipfs:// tokenURIs
  ipfsGateways: [
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
  ],

  // Relative-path tokenURI base (agents sometimes store "erc8004/agent-card/xxx")
  // Resolved against the agent's domain when discoverable; fallback bases below.
  relativeUriBases: [
    'https://8004.ai/',
    'https://agent-card.erc8004.org/',
  ],

  dbPath: process.env.BNB_DB || '/opt/bnb-marketplace/data/agents.db',
};
