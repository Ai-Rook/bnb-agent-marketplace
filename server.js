// server.js — BNB Agent Marketplace API + static UI + b402 hire flow
'use strict';

const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const b402 = require('./b402');
const selfList = require('./self-list');
const reputation = require('./reputation');
const altana = require('./altana-session');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3061;

// ── Agent directory API ────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  try {
    const { q, category, x402, active, sort, limit, offset } = req.query;
    const where = ['parsed_ok = 1'];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR description LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like);
    }
    if (category && category !== 'all') {
      where.push('category = ?');
      params.push(category);
    }
    if (x402 === '1' || x402 === 'true') {
      where.push('x402_support = 1');
    }
    if (active === '1' || active === 'true') {
      where.push('active = 1');
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;

    let orderBy = 'is_self DESC, x402_support DESC, agent_id ASC';
    if (sort === 'trust') orderBy = 'is_self DESC, x402_support DESC, agent_id ASC';
    else if (sort === 'x402') orderBy = 'x402_support DESC, is_self DESC, agent_id ASC';
    else if (sort === 'category') orderBy = 'is_self DESC, category ASC, agent_id ASC';

    const rows = db.db.prepare(`
      SELECT agent_id, owner, agent_wallet, name, description, image, active, x402_support,
        supported_trust, services, category, category_score, indexed_at, verified_usage, is_self, reputation_score
      FROM agents ${whereClause}
      ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).all(...params, lim, off);

    const total = db.db.prepare(`SELECT COUNT(*) AS c FROM agents ${whereClause}`).get(...params).c;

    res.json({
      agents: rows.map(r => ({
        ...r,
        supported_trust: JSON.parse(r.supported_trust || '[]'),
        services: JSON.parse(r.services || '[]'),
        verified_usage: r.verified_usage ? JSON.parse(r.verified_usage) : null,
        is_self: !!r.is_self,
      })),
      total,
      limit: lim,
      offset: off,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const row = db.db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'not found' });
    // Live reputation from 8004scan (real on-chain aggregated identity/reputation, free API)
    let repData = null;
    try { repData = await reputation.fetchReputation(parseInt(req.params.id, 10)); } catch (e) { /* non-fatal */ }
    res.json({
      ...row,
      supported_trust: JSON.parse(row.supported_trust || '[]'),
      services: JSON.parse(row.services || '[]'),
      verified_usage: row.verified_usage ? JSON.parse(row.verified_usage) : null,
      is_self: !!row.is_self,
      reputation: repData,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    service: 'bnb-agent-marketplace',
    status: 'ok',
    indexed: db.count(),
    parsed: db.countParsed(),
    x402_support: db.countX402(),
    self_listed: db.db.prepare('SELECT COUNT(*) AS c FROM agents WHERE is_self=1').get().c,
    reputation_source: '8004scan',
    onchain_total: parseInt(db.getMeta('total_agents_onchain') || '0', 10),
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const total = db.countParsed();
    const x402 = db.countX402();
    const byCategory = db.db.prepare('SELECT category, COUNT(*) AS c FROM agents WHERE parsed_ok=1 GROUP BY category ORDER BY c DESC').all();
    const onchain = parseInt(db.getMeta('total_agents_onchain') || '0', 10);
    const selfCount = db.db.prepare('SELECT COUNT(*) AS c FROM agents WHERE is_self=1').get().c;
    res.json({ indexed: db.count(), parsed: total, x402_support: x402, onchain_total: onchain, self_listed: selfCount, by_category: byCategory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Verified-usage history (accountability: trend over time) ─────────────
app.get('/api/usage-history/:agentId', (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    const rows = db.db.prepare('SELECT fetched_at, usage FROM usage_history WHERE agent_id = ? ORDER BY fetched_at ASC').all(agentId);
    res.json({ agent_id: agentId, snapshots: rows.map(r => ({ fetched_at: r.fetched_at, usage: JSON.parse(r.usage) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── b402 hire flow — 402 challenge → verify → settle ─────────────────────
app.post('/api/hire', async (req, res) => {
  try {
    const { agent_id, task, idempotency_key } = req.body || {};
    const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'];
    const idemKey = idempotency_key || req.headers['x-idempotency-key'] || null;

    if (agent_id === null || agent_id === undefined) return res.status(400).json({ error: 'agent_id required' });
    const row = db.db.prepare('SELECT agent_id, name, x402_support FROM agents WHERE agent_id = ?').get(parseInt(agent_id, 10));
    if (!row) return res.status(404).json({ error: 'agent not found' });
    if (!row.x402_support) {
      return res.status(402).json({ error: 'agent does not accept x402 payments', agent: row, payment_required: false });
    }

    // Idempotency: if this key was already settled, replay the receipt (no double-settle)
    if (idemKey) {
      const prior = db.db.prepare('SELECT * FROM hires WHERE idempotency_key = ?').get(idemKey);
      if (prior && prior.status === 'settled') {
        return res.json(JSON.parse(prior.receipt));
      }
      if (prior && prior.status === 'pending') {
        return res.status(202).json({ error: 'payment settlement in progress — retry with same idempotency key', status: 'pending' });
      }
    }

    const { requirePayment } = require('./altana');

    if (!paymentHeader) {
      // No payment yet → 402 challenge via self-hosted Altana b402 merchant
      const handle = await requirePayment(null);
      return res.status(402).set('X-PAYMENT-RESPONSE', JSON.stringify(handle.body)).json(handle.body);
    }

    if (idemKey) {
      db.db.prepare('INSERT OR REPLACE INTO hires (idempotency_key, agent_id, status, created_at) VALUES (?,?,?,?)')
        .run(idemKey, row.agent_id, 'pending', new Date().toISOString());
    }

    // Payment header present → verify + settle on-chain via self-hosted Altana merchant
    const handle = await requirePayment(paymentHeader);
    if (handle.status === 402) {
      if (idemKey) db.db.prepare('DELETE FROM hires WHERE idempotency_key = ?').run(idemKey);
      return res.status(402).set('X-PAYMENT-RESPONSE', JSON.stringify(handle.body)).json(handle.body);
    }
    const result = {
      ok: true,
      settleTx: handle.receipt.txHash,
      payer: handle.receipt.payer,
      network: 'eip155:56',
      amountUsd: handle.receipt.amount ? (Number(handle.receipt.amount) / 1e18).toString() : '0',
      currency: handle.receipt.rail && String(handle.receipt.rail).startsWith('permit2') ? 'USDT' : 'U',
      rail: handle.receipt.rail || '',
    };

    // Payment settled — build receipt, store it idempotently, deliver
    const receipt = {
      status: 'hired',
      agent: row,
      task: task || null,
      settlement: {
        transaction: result.settleTx,
        payer: result.payer,
        network: result.network,
      },
      receipt: {
        hired_at: new Date().toISOString(),
        agent_id: row.agent_id,
        amount_usd: result.amountUsd,
        currency: result.currency,
        facilitator: 'self-hosted (Altana)',
        settle_tx: result.settleTx,
        failure_mode: 'Settlement is confirmed on-chain before delivery. If the response is lost in transit, retry with the SAME X-Idempotency-Key header — you will receive the same receipt, not a double charge.',
      },
    };

    // BSC proof-of-execution anchor (best-effort — never blocks a settled hire)
    try {
      const { anchorReceipt } = require('./anchor');
      const anchor = await anchorReceipt({ agent_id: row.agent_id, settle_tx: result.settleTx, payer: result.payer, amount_usd: '0.50' }, 'hire');
      receipt.receipt.bsc_anchor = { hash: anchor.hash, tx: anchor.txHash };
      console.log('[bnb-marketplace] BSC anchor:', anchor.txHash);
    } catch (e) {
      console.warn('[bnb-marketplace] BSC anchor skipped:', e.message);
    }

    if (idemKey) {
      db.db.prepare('UPDATE hires SET status=?, settle_tx=?, payer=?, network=?, amount_usd=?, task=?, receipt=? WHERE idempotency_key=?')
        .run('settled', result.settleTx, result.payer, result.network, '0.50', task || null, JSON.stringify(receipt), idemKey);
    }
    res.json(receipt);
  } catch (e) {
    res.status(500).json({ error: e.message, status: 'internal_error' });
  }
});

// ── Static UI ──────────────────────────────────────────────────────────────
// ── Altana session keys + Keystore + revoke (buy-side differentiator) ──────────
app.get('/api/altana/status', (req, res) => {
  try {
    const w = altana.currentWallet();
    const s = altana.currentSession();
    res.json({ ok: true, network: config.bnbNetwork, wallet: w ? w.address : null, session: altana.sessionPublic(s) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/altana/wallet', async (req, res) => {
  try { const { wallet } = await altana.getAgentWallet(); res.json({ ok: true, wallet: wallet.address }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/altana/session', async (req, res) => {
  try {
    const { calls, spend, expiry } = req.body || {};
    const session = await altana.grantSession({ calls, spend }, expiry);
    db.saveAltanaSession({
      wallet_addr: session.walletAddress, public_key: session.publicKey,
      permissions: session.permissions, expiry: session.expiry,
      registered: 1, grant_tx: session.transactionHash || null,
    });
    res.json({ ok: true, session: altana.sessionPublic(session), grant_tx: session.transactionHash || null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/altana/session/register', async (req, res) => {
  try { const r = await altana.registerSession(); res.json({ ok: true, result: r }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/altana/session/execute', async (req, res) => {
  try {
    const calls = (req.body && req.body.calls) || altana.selfCall();
    const r = await altana.executeViaSession(calls);
    db.saveAltanaSession({ execute_tx: r.transactionHash || r.callsId || null });
    res.json({ ok: true, result: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/altana/session/revoke', async (req, res) => {
  try {
    const r = await altana.revokeSession();
    db.saveAltanaSession({ revoked: 1, revoke_tx: (r && r.transactionHash) || null });
    res.json({ ok: true, result: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[bnb-marketplace] API + UI on http://127.0.0.1:${PORT}`);
  console.log(`[bnb-marketplace] indexed=${db.count()} parsed=${db.countParsed()} x402=${db.countX402()}`);
  // Initial verified-usage refresh, then every 15 min (accountability: keep proof-of-execution live)
  selfList.main().catch(e => console.error('[bnb-marketplace] self-list refresh error:', e.message));
  setInterval(() => {
    selfList.main().catch(e => console.error('[bnb-marketplace] self-list refresh error:', e.message));
  }, 15 * 60 * 1000);
});
