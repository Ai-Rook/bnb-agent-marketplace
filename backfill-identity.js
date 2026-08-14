// backfill-identity.js — populate owner + agent_wallet for existing agents (no re-crawl)
'use strict';

const config = require('./config');
const db = require('./db');

async function rpc(method, params, retries = 2) {
  const rpcs = (config.rpcList && config.rpcList.length) ? config.rpcList : [config.rpc];
  let lastErr;
  for (const rpcUrl of rpcs) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
        return j.result;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

function addrFromHex(hex) {
  if (!hex || hex === '0x' || hex === '0x0000000000000000000000000000000000000000000000000000000000000000') return null;
  return '0x' + hex.slice(26);
}

async function fetchIdentity(agentId) {
  const ownerHex = await rpc('eth_call', [{ to: config.identityRegistry, data: '0x6352211e' + agentId.toString(16).padStart(64, '0') }, 'latest']);
  const walletHex = await rpc('eth_call', [{ to: config.identityRegistry, data: '0x00339509' + agentId.toString(16).padStart(64, '0') }, 'latest']);
  return { owner: addrFromHex(ownerHex), agent_wallet: addrFromHex(walletHex) };
}

async function main() {
  const concurrency = 20;
  const rows = db.db.prepare('SELECT agent_id FROM agents WHERE owner IS NULL').all();
  const update = db.db.prepare('UPDATE agents SET owner = ?, agent_wallet = ? WHERE agent_id = ?');

  let idx = 0, done = 0;
  async function worker() {
    while (idx < rows.length) {
      const row = rows[idx++];
      try {
        const { owner, agent_wallet } = await fetchIdentity(row.agent_id);
        update.run(owner, agent_wallet, row.agent_id);
        done++;
        if (done % 1000 === 0) console.log(`[backfill] ${done}/${rows.length}`);
      } catch (e) {
        // leave null, move on
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, rows.length); i++) workers.push(worker());
  await Promise.all(workers);

  const withOwner = db.db.prepare('SELECT COUNT(*) c FROM agents WHERE owner IS NOT NULL').get().c;
  const withWallet = db.db.prepare('SELECT COUNT(*) c FROM agents WHERE agent_wallet IS NOT NULL').get().c;
  console.log(`[backfill] done: ${done} processed, ${withOwner} owners, ${withWallet} wallets`);
  const stillNull = db.db.prepare('SELECT COUNT(*) c FROM agents WHERE owner IS NULL').get().c;
  console.log(`[backfill] still null owner: ${stillNull}`);
  db.close();
}

main().catch(e => { console.error('[backfill] FATAL:', e); db.close(); process.exit(1); });
