// anchor.js — BSC proof-of-execution anchoring (proof-of-existence on BNB Chain)
//
// Anchors a receipt's SHA-256 hash to BSC mainnet via a zero-value self-transfer
// with the hash in calldata. Verifiable on BscScan (tx input data = the hash).
// Uses the funded marketplace wallet (config.walletKeyPath) + RPC fallback list.
//
// Usage:
//   node anchor.js "<tag>"              # anchor a sample receipt
//   const { anchorReceipt } = require('./anchor'); await anchorReceipt(receipt, tag);
'use strict';

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const config = require('./config');

function sha256(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return '0x' + crypto.createHash('sha256').update(s).digest('hex');
}

// JSON-RPC with fallback across config.rpcList (no single-RPC dependency).
async function rpc(method, params) {
  let lastErr;
  for (const rpcUrl of config.rpcList) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/**
 * Anchor a receipt to BNB Chain. Returns { hash, txHash, payload }.
 * @param {object|string} receipt - receipt data (or a string)
 * @param {string} [tag] - label stored in the anchored payload (not on-chain)
 */
async function anchorReceipt(receipt, tag) {
  const key = fs.readFileSync(config.walletKeyPath, 'utf8').trim();
  const wallet = new ethers.Wallet(key); // offline signer

  const payload = { ...(typeof receipt === 'string' ? { note: receipt } : receipt), tag: tag || 'bnb-marketplace', anchoredAt: new Date().toISOString() };
  const hash = sha256(payload);

  const nonce = await rpc('eth_getTransactionCount', [wallet.address, 'latest']);
  const gasPrice = await rpc('eth_gasPrice', []);

  const tx = {
    to: wallet.address,          // self — hash lives in calldata (proof-of-existence)
    value: '0x0',
    data: hash,
    gasLimit: '0x7530',          // 30000
    gasPrice,
    nonce,
    chainId: config.chainId,     // 56 (mainnet)
  };

  const signed = await wallet.signTransaction(tx);
  const txHash = await rpc('eth_sendRawTransaction', [signed]);

  return { hash, txHash, payload };
}

module.exports = { anchorReceipt, sha256 };

// CLI test: node anchor.js "<tag>"
if (require.main === module) {
  const tag = process.argv[2] || 'smoke-test';
  anchorReceipt({ kind: 'smoke', note: 'Aether marketplace BSC proof-of-execution anchor' }, tag)
    .then((r) => {
      console.log('✅ anchored:', r.hash);
      console.log('   tx:', r.txHash);
      console.log('   bscscan: https://bscscan.com/tx/' + r.txHash);
    })
    .catch((e) => { console.error('❌ anchor failed:', e.message); process.exit(1); });
}
