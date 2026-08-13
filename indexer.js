// indexer.js — Enumerate ERC-8004 agents on BSC, decode metadata, store in SQLite
// Usage: node indexer.js [--from N] [--to N] [--concurrency C] [--limit N] [--sample]
'use strict';

const config = require('./config');
const db = require('./db');

let startedAt = 0;

// ── ABI fragments ──────────────────────────────────────────────────────────
const IDENTITY_ABI = [
  'function tokenURI(uint256 tokenId) external view returns (string memory)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
];

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const fromId = parseInt(arg('--from', '-1'), 10);
const toIdRaw = arg('--to', null);
const concurrency = parseInt(arg('--concurrency', '40'), 10);
const limit = parseInt(arg('--limit', '0'), 10); // 0 = no limit
const sample = args.includes('--sample');
const sampleEvery = parseInt(arg('--sample-every', '500'), 10);

// ── JSON-RPC helper (with retry/backoff) ────────────────────────────────────
async function rpc(method, params, retries = 4) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(config.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error('HTTP ' + res.status);
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ── tokenURI decode → registration JSON ────────────────────────────────────
function decodeAbiString(hex) {
  if (!hex || hex === '0x') return '';
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  // 32-byte offset, 32-byte length, then data
  const len = parseInt(h.slice(64, 128) || '0', 16);
  if (isNaN(len) || len === 0) return '';
  const dataHex = h.slice(128, 128 + len * 2);
  return Buffer.from(dataHex, 'hex').toString('utf8');
}

function tryBase64Decode(s) {
  try {
    const buf = Buffer.from(s, 'base64');
    // Validate: re-encode should roughly match (ignore padding/whitespace)
    const back = buf.toString('base64').replace(/=+$/, '');
    const orig = s.replace(/=+$/, '').replace(/\s+/g, '');
    if (back === orig || (orig.length > 20 && back.length > 10)) {
      const txt = buf.toString('utf8');
      if (txt.trimStart().startsWith('{') || txt.trimStart().startsWith('[')) return txt;
    }
  } catch (e) {}
  return null;
}

async function resolveUri(uri) {
  // Returns { kind, text } where text is JSON string or raw content
  if (!uri || uri.trim() === '') return { kind: 'empty', text: null };

  // data:application/json;base64,...
  if (uri.startsWith('data:application/json;base64,')) {
    const b64 = uri.slice('data:application/json;base64,'.length);
    return { kind: 'base64', text: Buffer.from(b64, 'base64').toString('utf8') };
  }
  // data:application/json,...
  if (uri.startsWith('data:application/json,')) {
    return { kind: 'data', text: decodeURIComponent(uri.slice('data:application/json,'.length)) };
  }
  // data:text/plain or other data:
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    if (comma >= 0) return { kind: 'data', text: decodeURIComponent(uri.slice(comma + 1)) };
  }
  // ipfs://
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    const results = await Promise.allSettled(config.ipfsGateways.map(gw =>
      fetch(gw + cid, { signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.text() : Promise.reject('bad status'))
    ));
    for (const r of results) if (r.status === 'fulfilled') return { kind: 'ipfs', text: r.value };
    return { kind: 'ipfs', text: null };
  }
  // http(s)://
  if (/^https?:\/\//.test(uri)) {
    try {
      const r = await fetch(uri, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return { kind: 'https', text: await r.text() };
      return { kind: 'https', text: null };
    } catch (e) {
      return { kind: 'https', text: null };
    }
  }
  // relative path — try bases in parallel
  const relResults = await Promise.allSettled(config.relativeUriBases.map(base =>
    fetch(base + uri, { signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.text() : Promise.reject('bad status'))
  ));
  for (const r of relResults) if (r.status === 'fulfilled') return { kind: 'relative', text: r.value };
  return { kind: 'relative', text: null };
}

function parseRegistration(text) {
  if (!text) return null;
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    // try stripping leading garbage up to first '{'
    const i = t.indexOf('{');
    if (i >= 0) {
      try { return JSON.parse(t.slice(i)); } catch (e2) {}
    }
    return null;
  }
}

// ── Category derivation (data-calibrated) ──────────────────────────────────
// Vocabulary probe on 14k parsed agents: "trading"=7706, "trade"=2374, "grid"=2346
// (but ALL grid hits are "dgrid.ai" spam — word boundary \bgrid\b excludes it), yield~51,
// staking~45, security~59, monitor~24, perpetual~44, arbitrage~4, liquidation~0.
const CATEGORIES = [
  {
    name: 'trading',
    phrases: [
      { re: /\btrading\b|\btrade\b|\bperpetual\b|\bfutures\b/i, w: 4 },
      { re: /\bscalp|arbitrage|mean\s*reversion|risk-managed|technical\s*analysis/i, w: 3 },
    ],
  },
  {
    name: 'monitoring',
    phrases: [
      { re: /\bmonitor|security|alert|watchlist|surveillance|observability/i, w: 4 },
      { re: /track(ing)?\s*(wallets|positions|markets|prices)/i, w: 4 },
    ],
  },
  {
    name: 'yield',
    phrases: [
      { re: /\byield\b|\bapy\b|\bapr\b|\bstaking\b|\blending\b|\bvault\b/i, w: 4 },
      { re: /liquidity\s*provision|\bfarm(ing)?\b/i, w: 3 },
    ],
  },
  {
    name: 'health-factor',
    phrases: [
      { re: /health\s*factor|healthfactor/i, w: 5 },
      { re: /\bliquidation\b|\bcollateral\b|\bloan\b|\bborrow\b|\bdebt\b/i, w: 3 },
    ],
  },
];

function deriveCategory(name, description, services) {
  const text = ((name || '') + ' ' + (description || '') + ' ' + (Array.isArray(services) ? services.map(s => s.name || '').join(' ') : '')).toLowerCase();
  let best = null, bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0, hits = 0;
    for (const p of cat.phrases) { if (p.re.test(text)) { score += p.w; hits++; } }
    if (score >= 4 && score > bestScore) { bestScore = score; best = cat.name; }
  }
  if (best === null) return { category: 'general', category_score: 0 };
  return { category: best, category_score: bestScore };
}

// ── Index one agent ────────────────────────────────────────────────────────
async function indexOne(agentId) {
  const rec = {
    agent_id: agentId, owner: null, agent_wallet: null, agent_uri: null, uri_kind: 'error',
    name: null, description: null, image: null, active: null,
    x402_support: null, supported_trust: [], services: [],
    category: 'general', category_score: 0, parsed_ok: false, error: null,
  };
  try {
    const uriHex = await rpc('eth_call', [{ to: config.identityRegistry, data: '0xc87b56dd' + agentId.toString(16).padStart(64, '0') }, 'latest']);
    const uri = decodeAbiString(uriHex);
    rec.agent_uri = uri;

    // Onchain identity: ERC-721 owner + EIP-712-verified agentWallet
    try {
      const ownerHex = await rpc('eth_call', [{ to: config.identityRegistry, data: '0x6352211e' + agentId.toString(16).padStart(64, '0') }, 'latest']);
      rec.owner = '0x' + ownerHex.slice(26); // last 20 bytes = address
    } catch (e) { rec.owner = null; }
    try {
      const walletHex = await rpc('eth_call', [{ to: config.identityRegistry, data: '0x00339509' + agentId.toString(16).padStart(64, '0') }, 'latest']);
      rec.agent_wallet = '0x' + walletHex.slice(26);
    } catch (e) { rec.agent_wallet = null; }

    const resolved = await resolveUri(uri);
    rec.uri_kind = resolved.kind;

    const reg = parseRegistration(resolved.text);
    if (reg) {
      rec.name = reg.name || null;
      rec.description = reg.description || null;
      rec.image = reg.image || null;
      rec.active = reg.active === true;
      rec.x402_support = reg.x402Support === true || reg['x402Support'] === true;
      rec.supported_trust = Array.isArray(reg.supportedTrust) ? reg.supportedTrust : [];
      rec.services = Array.isArray(reg.services) ? reg.services : [];
      rec.parsed_ok = true;
      const cat = deriveCategory(rec.name, rec.description, rec.services);
      rec.category = cat.category;
      rec.category_score = cat.category_score;
    } else if (resolved.text) {
      rec.error = 'unparseable-json';
    } else {
      rec.error = 'unresolvable-uri';
    }
  } catch (e) {
    rec.error = e.message.slice(0, 200);
  }
  return rec;
}

// ── Concurrency pool with incremental upsert ────────────────────────────────
async function poolWithCommit(ids, concurrency, onDone) {
  let idx = 0;
  let done = 0;
  let parsed = 0;
  let x402 = 0;
  const total = ids.length;
  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      const rec = await indexOne(id);
      db.upsertAgent(rec);
      done++;
      if (rec.parsed_ok) parsed++;
      if (rec.x402_support) x402++;
      if (done % 200 === 0) {
        db.setMeta('last_indexed_agent', String(id));
        const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`[indexer] progress: ${done}/${total} (${parsed} parsed, ${x402} x402) @${secs}s`);
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, ids.length); i++) workers.push(worker());
  await Promise.all(workers);
  onDone && onDone();
  return { done, parsed, x402 };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const lastIdHex = await rpc('eth_getStorageAt', [config.identityRegistry, config.lastIdSlot, 'latest']);
  const totalAgents = parseInt(lastIdHex, 16);
  console.log(`[indexer] BSC ERC-8004 total agents: ${totalAgents}`);

  // Resume from last indexed agent if --from not explicitly set
  let startId = fromId;
  if (startId < 0) {
    const lastIdx = parseInt(db.getMeta('last_indexed_agent') || '0', 10);
    startId = lastIdx + 1;
    console.log(`[indexer] resuming from agent ${startId}`);
  }

  let toId = toIdRaw ? parseInt(toIdRaw, 10) : totalAgents;
  toId = Math.min(toId, totalAgents);

  // Build agent id list
  let ids = [];
  for (let id = startId; id < toId; id++) {
    if (sample) {
      if (id === startId || (id - startId) % sampleEvery === 0) ids.push(id);
    } else {
      ids.push(id);
    }
  }
  if (limit > 0) ids = ids.slice(0, limit);

  console.log(`[indexer] indexing ${ids.length} agents (from=${startId} to=${toId}, concurrency=${concurrency})`);
  if (ids.length === 0) { console.log('[indexer] nothing to do'); return; }

  const started = Date.now();
  startedAt = Date.now();

  const { done, parsed, x402 } = await poolWithCommit(ids, concurrency);

  db.setMeta('last_indexed_agent', String(toId - 1));
  db.setMeta('total_agents_onchain', String(totalAgents));

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[indexer] done in ${secs}s — ${done} indexed, ${parsed} parsed, ${x402} x402-support`);
  console.log(`[indexer] db totals: ${db.count()} stored, ${db.countParsed()} parsed, ${db.countX402()} x402`);
}

main().then(() => {
  db.close();
  process.exit(0);
}).catch(e => {
  console.error('[indexer] FATAL:', e);
  db.close();
  process.exit(1);
});
