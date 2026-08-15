// rederive.js — re-run category derivation on all parsed agents (no re-index)
'use strict';

const db = require('./db');

// Mirrors indexer.js deriveCategory (data-calibrated regex version)
const CATEGORIES = [
  { name: 'grid-trading', phrases: [
    { re: /\btrading\b|\btrade\b|\bperpetual\b|\bfutures\b/i, w: 4 }, { re: /\bscalp|arbitrage|mean\s*reversion|risk-managed|technical\s*analysis/i, w: 3 },
  ]},
  { name: 'rebalancing', phrases: [
    { re: /\brebalanc|re-balanc|reallocat|re-allocat|asset\s*allocation/i, w: 5 }, { re: /\bportfolio\b|position\s*sizing|risk\s*parity/i, w: 3 },
  ]},
  { name: 'yield', phrases: [
    { re: /\byield\b|\bapy\b|\bapr\b|\bstaking\b|\blending\b|\bvault\b/i, w: 4 }, { re: /liquidity\s*provision|\bfarm(ing)?\b/i, w: 3 },
  ]},
  { name: 'health-factor', phrases: [
    { re: /health\s*factor|healthfactor|\bliquidation\b|\bcollateral\b/i, w: 5 }, { re: /\blending\b|\blend\b|\bloan\b|\bborrow\b|\bdebt\b/i, w: 4 }, { re: /safety\s*enforcement|policyguard|\baave\b|\bcompound\b/i, w: 4 }, { re: /\bmonitor|security|alert|watchlist|surveillance|observability|track/i, w: 4 },
  ]},
];

function deriveCategory(name, description, services) {
  const text = ((name || '') + ' ' + (description || '') + ' ' + (Array.isArray(services) ? services.map(s => s.name || '').join(' ') : '')).toLowerCase();
  let best = null, bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0, hits = 0;
    for (const p of cat.phrases) { if (p.re.test(text)) { score += p.w; hits++; } }
    if (score >= 4 && score > bestScore) { bestScore = score; best = cat.name; }
  }
  return { category: best || 'general', category_score: bestScore };
}

const rows = db.db.prepare('SELECT agent_id, name, description, services FROM agents WHERE parsed_ok = 1').all();
const update = db.db.prepare('UPDATE agents SET category = ?, category_score = ? WHERE agent_id = ?');

let n = 0;
for (const r of rows) {
  const svcs = JSON.parse(r.services || '[]');
  const c = deriveCategory(r.name, r.description, svcs);
  update.run(c.category, c.category_score, r.agent_id);
  n++;
}

console.log(`[rederive] re-derived ${n} agents`);
const dist = db.db.prepare('SELECT category, COUNT(*) c FROM agents WHERE parsed_ok=1 GROUP BY category ORDER BY c DESC').all();
dist.forEach(x => console.log(' ', x.category, x.c));
db.close();
