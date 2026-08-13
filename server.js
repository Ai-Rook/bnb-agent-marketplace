// server.js — BNB Agent Marketplace API + static UI + b402 hire flow
'use strict';

const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const b402 = require('./b402');
const selfList = require('./self-list');
const reputation = require('./reputation');

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
    if (sort === 'x402') orderBy = 'is_self DESC, x402_support DESC, agent_id ASC';
    else if (sort === 'category') orderBy = 'is_self DESC, category ASC, agent_id ASC';

    const rows = db.db.prepare(`
      SELECT agent_id, owner, agent_wallet, name, description, image, active, x402_support,
        supported_trust, services, category, category_score, indexed_at, verified_usage, is_self
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

app.get('/api/agents/:id', (req, res) => {
  try {
    const row = db.db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({
      ...row,
      supported_trust: JSON.parse(row.supported_trust || '[]'),
      services: JSON.parse(row.services || '[]'),
      verified_usage: row.verified_usage ? JSON.parse(row.verified_usage) : null,
      is_self: !!row.is_self,
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
    reputation_enabled: reputation.ENABLED,
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
    const { agent_id, task } = req.body || {};
    const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'];

    if (agent_id === null || agent_id === undefined) return res.status(400).json({ error: 'agent_id required' });
    const row = db.db.prepare('SELECT agent_id, name, x402_support FROM agents WHERE agent_id = ?').get(parseInt(agent_id, 10));
    if (!row) return res.status(404).json({ error: 'agent not found' });
    if (!row.x402_support) {
      return res.status(402).json({ error: 'agent does not accept x402 payments', agent: row, payment_required: false });
    }

    if (!paymentHeader) {
      // No payment yet → issue 402 challenge with b402 payment requirements
      const challenge = b402.paymentChallenge(`Hire agent #${row.agent_id} (${row.name})`);
      return res.status(402).set('X-PAYMENT-RESPONSE', JSON.stringify(challenge)).json(challenge);
    }

    // Payment header present → verify + settle via b402 facilitator
    const result = await b402.verifySettle(paymentHeader);
    if (!result.ok) {
      return res.status(402).json({ error: result.error });
    }

    // Payment settled — deliver the hire result
    res.json({
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
        amount_usd: '0.50',
        currency: 'USDT',
        facilitator: config.b402Facilitator,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Static UI ──────────────────────────────────────────────────────────────
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
