// db.js — SQLite store for indexed ERC-8004 agents (node:sqlite)
'use strict';
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 15000;
`);

// Migration: add agent_wallet column if missing (2026-08-13 identity backfill)
const cols = db.prepare("PRAGMA table_info(agents)").all().map(c => c.name);
if (!cols.includes('agent_wallet')) {
  db.exec('ALTER TABLE agents ADD COLUMN agent_wallet TEXT');
}
if (!cols.includes('verified_usage')) {
  db.exec('ALTER TABLE agents ADD COLUMN verified_usage TEXT');
}
if (!cols.includes('is_self')) {
  db.exec('ALTER TABLE agents ADD COLUMN is_self INTEGER DEFAULT 0');
}
if (!cols.includes('reputation_score')) {
  db.exec('ALTER TABLE agents ADD COLUMN reputation_score REAL');
}
if (!cols.includes('reputation_detail')) {
  db.exec('ALTER TABLE agents ADD COLUMN reputation_detail TEXT');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id   INTEGER,
    fetched_at TEXT,
    usage      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_usage_history ON usage_history(agent_id, fetched_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    agent_id        INTEGER PRIMARY KEY,
    owner           TEXT,
    agent_wallet    TEXT,
    agent_uri       TEXT,
    uri_kind        TEXT,           -- 'base64' | 'data' | 'https' | 'ipfs' | 'relative' | 'empty' | 'error'
    name            TEXT,
    description     TEXT,
    image           TEXT,
    active          INTEGER,
    x402_support    INTEGER,
    supported_trust TEXT,           -- JSON array
    services        TEXT,           -- JSON array
    category        TEXT,           -- derived category
    category_score  REAL,           -- confidence of category match
    parsed_ok       INTEGER,
    error           TEXT,
    indexed_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
  CREATE INDEX IF NOT EXISTS idx_agents_x402 ON agents(x402_support);
  CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO agents (agent_id, owner, agent_wallet, agent_uri, uri_kind, name, description, image,
    active, x402_support, supported_trust, services, category, category_score,
    parsed_ok, error, indexed_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(agent_id) DO UPDATE SET
    owner=excluded.owner, agent_wallet=excluded.agent_wallet, agent_uri=excluded.agent_uri, uri_kind=excluded.uri_kind,
    name=excluded.name, description=excluded.description, image=excluded.image,
    active=excluded.active, x402_support=excluded.x402_support,
    supported_trust=excluded.supported_trust, services=excluded.services,
    category=excluded.category, category_score=excluded.category_score,
    parsed_ok=excluded.parsed_ok, error=excluded.error, indexed_at=excluded.indexed_at
`);

function upsertAgent(a) {
  upsertStmt.run(
    a.agent_id, a.owner, a.agent_wallet, a.agent_uri, a.uri_kind, a.name, a.description, a.image,
    a.active ? 1 : 0, a.x402_support ? 1 : 0,
    JSON.stringify(a.supported_trust || []), JSON.stringify(a.services || []),
    a.category, a.category_score, a.parsed_ok ? 1 : 0, a.error || null,
    new Date().toISOString()
  );
}

const metaStmt = db.prepare('INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const metaGetStmt = db.prepare('SELECT value FROM meta WHERE key = ?');

function setMeta(key, value) { metaStmt.run(key, String(value)); }
function getMeta(key) { const r = metaGetStmt.get(key); return r ? r.value : null; }

function count() { return db.prepare('SELECT COUNT(*) AS c FROM agents').get().c; }
function countParsed() { return db.prepare('SELECT COUNT(*) AS c FROM agents WHERE parsed_ok=1').get().c; }
function countX402() { return db.prepare('SELECT COUNT(*) AS c FROM agents WHERE x402_support=1').get().c; }

function close() { try { db.close(); } catch (e) {} }

module.exports = { db, upsertAgent, setMeta, getMeta, count, countParsed, countX402, close };
