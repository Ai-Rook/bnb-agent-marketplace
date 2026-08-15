// update-traction.js — compute on-chain traction (tx count, unique buyers, volume)
// for our payment wallets and store it in each self-listed agent's verified_usage.
// x402scan-style metrics, but read straight from the chain (proof-of-execution).
'use strict';

const db = require('./db');
const config = require('./config');

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Traction sources: wallet → token(s) → chain RPC. Known self-wallets excluded
// from "unique buyers" so we only count EXTERNAL payers.
const KNOWN = new Set([
  '0xd5f96558fcb1f127c77c7d95eea067f526d08618', // Base CDP receiver (x402 payTo)
  '0x58036314b04952b37bf77758abd6d806cfb24ecc', // Base CDP client (buyer)
  '0x1af8369db07255cd2fd394b8b59926b59b58f92b', // x402 env wallet
  '0xb680b333211ac2b670b080bee6267d1173c81049', // BSC marketplace wallet (self)
  '0x4c9c4892d5aa3db7708d70a1891d7a581afef809', // roundtrip buyer (test)
]);

const SOURCES = [
  // Rook Trading Intelligence — x402-atm settlements (Base USDC)
  { rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, to: '0xd5f96558FCb1f127c77C7d95EEa067F526d08618', chain: 'base', blocks: 500000 },
  // BSC marketplace wallet — USDT + $U
  { rpcs: config.rpcList, token: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, to: '0xb680B333211Ac2B670b080beE6267d1173c81049', chain: 'bsc', blocks: 20000 },
  { rpcs: config.rpcList, token: '0xcE24439F2D9C6a2289F741120FE202248B666666', decimals: 18, to: '0xb680B333211Ac2B670b080beE6267d1173c81049', chain: 'bsc', blocks: 20000 },
];

async function rpc(rpcs, method, params) {
  let lastErr;
  for (const url of rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return d.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function scanSource(src) {
  const latest = parseInt(await rpc(src.rpcs, 'eth_blockNumber', []), 16);
  const from = Math.max(0, latest - src.blocks);
  const toPadded = '0x000000000000000000000000' + src.to.slice(2).toLowerCase();
  const CHUNK = 8000;

  let totalUnits = 0n, txCount = 0;
  const senders = new Map();

  for (let b = from; b < latest; b += CHUNK) {
    const to = Math.min(b + CHUNK - 1, latest);
    let logs = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        logs = await rpc(src.rpcs, 'eth_getLogs', [{
          address: src.token,
          fromBlock: '0x' + b.toString(16),
          toBlock: '0x' + to.toString(16),
          topics: [TRANSFER_TOPIC, null, toPadded],
        }]);
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    for (const log of logs) {
      const fromAddr = ('0x' + log.topics[1].slice(26)).toLowerCase();
      if (KNOWN.has(fromAddr)) continue; // ignore self-transfers
      const amt = BigInt(log.data);
      totalUnits += amt;
      txCount++;
      senders.set(fromAddr, true);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const volume = Number(totalUnits) / Math.pow(10, src.decimals);
  return { chain: src.chain, token: src.token, to: src.to, tx_count: txCount, unique_buyers: senders.size, volume };
}

async function main() {
  const results = [];
  for (const src of SOURCES) {
    try {
      const r = await scanSource(src);
      results.push(r);
      console.log(`[traction] ${r.chain} ${r.token.slice(0,10)}… → ${r.to.slice(0,10)}… : ${r.tx_count} txs, ${r.unique_buyers} buyers, ${r.volume.toFixed(2)} vol`);
    } catch (e) {
      console.error(`[traction] ${src.chain} scan failed:`, e.message);
    }
  }

  const traction = {
    computed_at: new Date().toISOString(),
    note: 'On-chain ERC-20 Transfer events to our payment wallets (recent window). Unique buyers exclude known self-wallets. Stablecoins ≈ USD.',
    rails: results,
  };

  // Attach to every self-listed agent (they share the platform payment rails).
  const selfAgents = db.db.prepare('SELECT agent_id, verified_usage FROM agents WHERE is_self = 1').all();
  for (const a of selfAgents) {
    let vu = {};
    try { vu = JSON.parse(a.verified_usage || '{}'); } catch {}
    vu.traction = traction;
    db.db.prepare('UPDATE agents SET verified_usage = ? WHERE agent_id = ?').run(JSON.stringify(vu), a.agent_id);
  }
  console.log(`[traction] stored on ${selfAgents.length} self-listed agents`);
  db.close();
}

main().catch(e => { console.error('[traction] FATAL:', e.message); db.close(); process.exit(1); });
