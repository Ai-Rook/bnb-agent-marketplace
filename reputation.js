// reputation.js — enrich agents with reputation scores from Quicknode ERC-8004 Explorer
// OPTIONAL + GATED: the Quicknode REST API is paywalled via x402 USDC on Base ($0.001/request).
// This module is ready but does NOT spend money unless REPUTATION_ENABLED=true is set.
// BDubs must approve the ~$20 spend for a 20k-agent backfill before enabling.
'use strict';

const config = require('./config');
const db = require('./db');

const QN_API = 'https://erc-8004.quicknode.com/v1';
const QN_CHAIN = 'eip155:56'; // BSC mainnet

const ENABLED = (process.env.REPUTATION_ENABLED || 'false') === 'true';

// Migration: add reputation columns if missing
const cols = db.db.prepare('PRAGMA table_info(agents)').all().map(c => c.name);
if (!cols.includes('reputation_score')) db.db.exec('ALTER TABLE agents ADD COLUMN reputation_score REAL');
if (!cols.includes('reputation_detail')) db.db.exec('ALTER TABLE agents ADD COLUMN reputation_detail TEXT');

/**
 * Fetch reputation for a single agent. Requires a funded Base USDC wallet + a signed
 * x402 payment in the X-PAYMENT header — NOT implemented here because it costs money.
 * This is a stub documenting the exact call shape for when BDubs approves the spend.
 */
async function fetchReputation(agentId) {
  if (!ENABLED) return null;
  // When enabled: sign an x402 payment (USDC on Base, $0.001) and replay:
  //   GET {QN_API}/agents/{agentId}/reputation?chain={QN_CHAIN}
  //   headers: { 'X-PAYMENT': '<signed payment>' }
  // Response: { score, breakdown, feedbackCount, validationCount, ... }
  // Returns null on 402 (no payment), 429 (rate limit), or error.
  const res = await fetch(`${QN_API}/agents/${agentId}/reputation?chain=${QN_CHAIN}`, {
    signal: AbortSignal.timeout(8000),
    // headers: { 'X-PAYMENT': signedPayment },
  });
  if (res.status === 402) return null; // not paid — expected until enabled
  if (!res.ok) return null;
  return await res.json();
}

async function enrichOne(agentId) {
  const data = await fetchReputation(agentId);
  if (!data) return;
  db.db.prepare('UPDATE agents SET reputation_score = ?, reputation_detail = ? WHERE agent_id = ?')
    .run(data.score ?? null, JSON.stringify(data), agentId);
}

async function enrichRange(ids) {
  if (!ENABLED) {
    console.log('[reputation] disabled (REPUTATION_ENABLED != true) — no money spent. Set env to enable.');
    return;
  }
  for (const id of ids) {
    await enrichOne(id).catch(() => {});
  }
}

module.exports = { enrichRange, enrichOne, ENABLED, QN_API };
