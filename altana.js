// altana.js — self-hosted b402 sell-side via @altananetwork/x402-server.
// Replaces the Binance-hosted facilitator (which is geo-blocked for US) with a
// merchant WE run: 402 challenge → verify X-PAYMENT → settle on-chain ourselves.
//
// The facilitator EOA (our funded wallet) only broadcasts + pays gas; funds move
// payer → payTo (same wallet). Payable by BNB Agent Studio buyers (EIP-3009 $U)
// and Altana SDK buyers (permit2-exact USDT).
'use strict';

const fs = require('fs');
const config = require('./config');

let _merchant = null;

async function getMerchant() {
  if (_merchant) return _merchant;
  const { createX402Merchant, U_TOKEN, USDT_BSC } = await import('@altananetwork/x402-server');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { bsc } = await import('viem/chains');

  const key = fs.readFileSync(config.walletKeyPath, 'utf8').trim();
  const facilitator = privateKeyToAccount(key);

  _merchant = createX402Merchant({
    chainId: 56,
    payTo: facilitator.address,                    // our funded wallet (earnings land here)
    price: 500000000000000000n,                    // $0.50 (18-dec atomic)
    minPrice: 500000000000000000n,                 // floor $0.50
    maxPrice: 2000000000000000000n,                // ceiling $2.00
    rails: [
      { rail: 'eip3009', token: U_TOKEN[56] },                                          // Studio buyers ($U)
      { rail: 'permit2-exact', token: USDT_BSC, spender: facilitator.address },         // Altana/B402 buyers (USDT)
    ],
    resource: { url: 'https://ai-rook.com/bnb-marketplace/', description: 'Hire an agent on BNB Agent Studio', mimeType: 'application/json' },
    description: 'Hire an agent on BNB Agent Studio',
    facilitator,
    rpcUrl: config.rpcList[0],
    chain: bsc,
  });
  return _merchant;
}

/**
 * Run the b402 gate for a request.
 * @param {string|null} xPaymentHeader  X-PAYMENT header value (or null for a 402 challenge)
 * @returns {Promise<{status:number, body?:object, receipt?:object}>}
 *   status 402 → challenge or rejection (body); status 200 → settled (receipt).
 */
async function requirePayment(xPaymentHeader) {
  const m = await getMerchant();
  return m.requirePayment(xPaymentHeader);
}

module.exports = { requirePayment };
