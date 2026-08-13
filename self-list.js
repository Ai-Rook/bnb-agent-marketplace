// self-list.js — seed our own production agents with VERIFIED usage (proof-of-execution)
// Pulls real data from x402-atm /api/trust + /health + engine/aether health, not self-reported blurbs.
'use strict';

const db = require('./db');

const UPSTREAMS = {
  x402Trust: 'http://127.0.0.1:3051/api/trust',
  x402Health: 'http://127.0.0.1:3051/health',
  engineHealth: 'http://127.0.0.1:3007/health',
  aetherHealth: 'http://127.0.0.1:3020/health',
  mmtHubHealth: 'http://127.0.0.1:3025/health',
};

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function addr(s) { return s && s.startsWith('0x') && s.length === 42 ? s : null; }

async function main() {
  const [trust, x402h, eng, aeth, mmt] = await Promise.all([
    fetchJson(UPSTREAMS.x402Trust), fetchJson(UPSTREAMS.x402Health),
    fetchJson(UPSTREAMS.engineHealth), fetchJson(UPSTREAMS.aetherHealth),
    fetchJson(UPSTREAMS.mmtHubHealth),
  ]);

  const now = new Date().toISOString();

  // ── Self-listing 1: Rook Trading Intelligence (agent 59646, x402-atm) ──
  if (trust) {
    const usage = {
      verified: true,
      source: 'x402-atm /api/trust + /health (live)',
      fetched_at: now,
      agent_id: trust.identity?.agent_id || 59646,
      chain: trust.identity?.chain || 'eip155:8453',
      // Proof of execution — real settled activity, not self-reported
      receipts_anchored_hcs: trust.activity?.receipts_anchored_total ?? null,
      escrow_jobs_created: trust.activity?.escrow_jobs_created ?? null,
      disputes: trust.activity?.disputes ?? null,
      first_service_day: trust.age_proof?.first_service_day ?? null,
      hcs_topic: trust.age_proof?.hcs_topic ?? null,
      // Live capacity
      endpoints: x402h?.endpoints ?? null,
      rails: x402h?.rails ?? [],
      merchants: x402h?.merchants ?? null,
      clusters: trust.clusters || {},
      verify_links: trust.verification || {},
    };
    db.db.prepare(`
      INSERT INTO agents (agent_id, owner, agent_wallet, agent_uri, uri_kind, name, description, image,
        active, x402_support, supported_trust, services, category, category_score, parsed_ok, error, indexed_at, verified_usage, is_self)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name=excluded.name, description=excluded.description, active=excluded.active,
        x402_support=excluded.x402_support, category=excluded.category,
        verified_usage=excluded.verified_usage, is_self=excluded.is_self,
        indexed_at=excluded.indexed_at
    `).run(
      -59646, trust.identity?.agent_id ? '0x1af8369db07255cd2fd394b8b59926b59b58f92b' : null, null,
      'https://agents.ai-rook.com', 'https', 'Rook Trading Intelligence',
      'Live crypto trading intelligence for AI agents — real-time BTC signals, CVD, order flow, and active strategy setups. 72 x402 endpoints, 4 payment rails. Proof-of-execution anchored on Hedera HCS + ERC-8004 reputation (Agent 59646).',
      null, 1, 1, JSON.stringify(['reputation', 'tee-attestation']),
      JSON.stringify([{ name: 'x402', endpoint: 'https://agents.ai-rook.com' }]),
      'grid-trading', 10, 1, null, now, JSON.stringify(usage), 1
    );
    console.log('[self-list] Rook Trading Intelligence seeded with verified usage');
  } else {
    console.warn('[self-list] x402-atm /api/trust unreachable — skipping');
  }

  // ── Self-listing 2: rook-engine signals (monitoring/grid-trading agent) ──
  if (eng) {
    const strategies = eng.session?.strategies_enabled || [];
    const usage = {
      verified: true,
      source: 'rook-engine /health (live)',
      fetched_at: now,
      active_trades: eng.total_active ?? 0,
      strategies_live: strategies,
      trade_count_today: eng.session?.trade_count ?? 0,
      daily_pnl: eng.session?.daily_pnl ?? 0,
      mode: eng.mode ?? null,
      paper: eng.paper ?? null,
      cvd: eng.cvd ?? null,
      oi: eng.oi ?? null,
    };
    db.db.prepare(`
      INSERT INTO agents (agent_id, owner, agent_wallet, agent_uri, uri_kind, name, description, image,
        active, x402_support, supported_trust, services, category, category_score, parsed_ok, error, indexed_at, verified_usage, is_self)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name=excluded.name, description=excluded.description, active=excluded.active,
        x402_support=excluded.x402_support, category=excluded.category,
        verified_usage=excluded.verified_usage, is_self=excluded.is_self,
        indexed_at=excluded.indexed_at
    `).run(
      -3007, null, null, 'http://127.0.0.1:3007', 'internal', 'Rook Signal Engine',
      'Multi-strategy crypto signal engine — live BTC setups, CVD/OI confluence, MA-cross and turtle-soup strategies. ' + strategies.join(', ') + ' currently live.',
      null, 1, 1, JSON.stringify(['reputation']),
      JSON.stringify([{ name: 'health', endpoint: 'http://127.0.0.1:3007/health' }]),
      'monitoring', 9, 1, null, now, JSON.stringify(usage), 1
    );
    console.log('[self-list] Rook Signal Engine seeded (strategies: ' + strategies.join(', ') + ')');
  }

  // ── Self-listing 3: MMT heatmap / orderflow (monitoring agent) ──
  if (aeth) {
    const usage = {
      verified: true,
      source: 'aether /health (live)',
      fetched_at: now,
      price: aeth.price ?? null,
      paper_mode: aeth.paper_mode ?? null,
      signals_scored: aeth.stats?.signals ?? null,
      ws_connected: aeth.ws_connected ?? null,
      bydfi_feed: aeth.bydfi_feed ?? null,
    };
    db.db.prepare(`
      INSERT INTO agents (agent_id, owner, agent_wallet, agent_uri, uri_kind, name, description, image,
        active, x402_support, supported_trust, services, category, category_score, parsed_ok, error, indexed_at, verified_usage, is_self)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name=excluded.name, description=excluded.description, active=excluded.active,
        x402_support=excluded.x402_support, category=excluded.category,
        verified_usage=excluded.verified_usage, is_self=excluded.is_self,
        indexed_at=excluded.indexed_at
    `).run(
      -3020, null, null, 'http://127.0.0.1:3020', 'internal', 'Aether Orderflow Engine',
      'Real-time MMT-fed market microstructure — CVD, open interest, divergence scoring, and SFP zones across timeframes.',
      null, 1, 1, JSON.stringify(['reputation']),
      JSON.stringify([{ name: 'health', endpoint: 'http://127.0.0.1:3020/health' }]),
      'monitoring', 8, 1, null, now, JSON.stringify(usage), 1
    );
    console.log('[self-list] Aether Orderflow Engine seeded');
  }

  // ── Self-listing 4: MMT Heatmap / Whale Flow (monitoring agent) ──
  if (mmt) {
    const usage = {
      verified: true,
      source: 'mmt-hub /health (live)',
      fetched_at: now,
      price: mmt.price ?? null,
      whale_direction: mmt.whale?.direction ?? null,
      whale_value: mmt.whale?.value ?? null,
      whale_cumulative: mmt.whale?.cumulativeValue ?? null,
      connections: Object.entries(mmt.connections || {}).map(([k, v]) => k + ':' + (v.status === 'connected' ? 'up' : 'down')),
      uptime_sec: mmt.uptime ?? null,
    };
    db.db.prepare(`
      INSERT INTO agents (agent_id, owner, agent_wallet, agent_uri, uri_kind, name, description, image,
        active, x402_support, supported_trust, services, category, category_score, parsed_ok, error, indexed_at, verified_usage, is_self)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name=excluded.name, description=excluded.description, active=excluded.active,
        x402_support=excluded.x402_support, category=excluded.category,
        verified_usage=excluded.verified_usage, is_self=excluded.is_self,
        indexed_at=excluded.indexed_at
    `).run(
      -3025, null, null, 'http://127.0.0.1:3025', 'internal', 'MMT Heatmap & Whale Flow',
      'Real-time liquidity heatmaps, whale order flow, and cumulative volume delta across BSC/Binance futures. Multi-exchange orderbook visualization.',
      null, 1, 1, JSON.stringify(['reputation']),
      JSON.stringify([{ name: 'health', endpoint: 'http://127.0.0.1:3025/health' }]),
      'monitoring', 8, 1, null, now, JSON.stringify(usage), 1
    );
    console.log('[self-list] MMT Heatmap & Whale Flow seeded');
  }

  const selfCount = db.db.prepare('SELECT COUNT(*) c FROM agents WHERE is_self=1').get().c;
  console.log('[self-list] done — ' + selfCount + ' self-listed agents with verified usage');

  // Record a snapshot into usage_history for trend tracking
  const recordHistory = db.db.prepare('INSERT INTO usage_history (agent_id, fetched_at, usage) VALUES (?,?,?)');
  const selfAgents = db.db.prepare('SELECT agent_id, verified_usage FROM agents WHERE is_self=1').all();
  for (const a of selfAgents) {
    recordHistory.run(a.agent_id, now, a.verified_usage);
  }
  const snapshots = db.db.prepare('SELECT COUNT(*) c FROM usage_history').get().c;
  console.log('[self-list] usage_history snapshots total: ' + snapshots);
}

if (require.main === module) {
  main().then(() => { db.close(); process.exit(0); }).catch(e => { console.error('[self-list] FATAL:', e); db.close(); process.exit(1); });
}

module.exports = { main, fetchJson, UPSTREAMS };
