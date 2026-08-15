'use strict';
// reputation.js — enrich agents with real ERC-8004 identity + reputation from 8004scan.
// Replaces the old Quicknode stub. 8004scan aggregates on-chain identity/reputation across
// all chains into a free queryable API (no auth key). Single agent:
//   GET https://8004scan.io/api/v1/agents/{chain_id}/{token_id}
// Fields: total_score, average_score, total_feedbacks, total_validations, rank,
//   is_verified, health_score, star_count, owner_address, x402_supported, etc.

const config = require('./config');
const db = require('./db');

const SCAN_API = 'https://8004scan.io/api/v1/agents';
const BSC_CHAIN_ID = config.chainId || 56; // marketplace indexes BSC

// in-memory cache to avoid hammering 8004scan on repeat views
const _cache = new Map(); // agentId -> { data, ts }
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

async function fetchReputation(agentId) {
  const cached = _cache.get(agentId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const url = `${SCAN_API}/${BSC_CHAIN_ID}/${agentId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const d = await res.json();
  const out = {
    total_score: d.total_score ?? null,
    average_score: d.average_score ?? null,
    total_feedbacks: d.total_feedbacks ?? null,
    total_validations: d.total_validations ?? null,
    successful_validations: d.successful_validations ?? null,
    rank: d.rank ?? null,
    network_rank: d.network_rank ?? null,
    is_verified: d.is_verified ?? null,
    health_score: d.health_score ?? null,
    health_status: d.health_status ?? null,
    star_count: d.star_count ?? null,
    owner_address: d.owner_address ?? null,
    owner_username: d.owner_username ?? null,
    x402_supported: d.x402_supported ?? null,
    agent_wallet: d.agent_wallet ?? null,
    supported_protocols: d.supported_protocols ?? null,
    categories: d.categories ?? null,
    source: '8004scan',
  };
  _cache.set(agentId, { data: out, ts: Date.now() });
  return out;
}

async function enrichOne(agentId) {
  const data = await fetchReputation(agentId);
  if (!data) return null;
  try {
    db.db.prepare('UPDATE agents SET reputation_score = ?, reputation_detail = ? WHERE agent_id = ?')
      .run(data.total_score ?? null, JSON.stringify(data), agentId);
  } catch (e) { /* non-fatal */ }
  return data;
}

async function enrichRange(ids) {
  const out = [];
  for (const id of ids) {
    try { const r = await enrichOne(id); if (r) out.push({ agent_id: id, ...r }); } catch (e) {}
  }
  return out;
}

module.exports = { fetchReputation, enrichOne, enrichRange, SCAN_API };
