'use strict';
// altana-session.js — Altana BUY-SIDE: agent's own smart-account wallet + scoped
// session keys (call allowlist + spend cap + expiry) + on-chain Keystore registration
// + live session-key txns + user-facing revoke. The differentiator for the Altana track.
//
// Uses @altananetwork/sdk v0.7.1 (ESM) via dynamic import. Mirrors the sell-side
// altana.js pattern (which uses @altananetwork/x402-server).

const fs = require('fs');
const path = require('path');
const config = require('./config');

let _client = null;
let _network = null;
let _agent = null;   // { wallet, signer }
let _session = null; // live Session object (in-memory; signer not serializable to SQLite)

async function init() {
  if (_client) return { client: _client, network: _network };
  const { createClient, BNB, BNB_TESTNET } = await import('@altananetwork/sdk');
  _network = (config.bnbNetwork === 'bsc-testnet') ? BNB_TESTNET : BNB;
  _client = createClient({ chains: [_network], defaultChainId: _network.chainId });
  return { client: _client, network: _network };
}

function agentKeyPath() {
  return config.agentKeyPath || '/opt/bnb-marketplace/agent-wallet.key';
}

// Create (or load) the agent's Altana smart-account wallet. Counterfactual — no on-chain tx.
async function getAgentWallet() {
  if (_agent) return _agent;
  const { signerFromPrivateKey, createPrivateKeySigner } = await import('@altananetwork/sdk');
  const { client } = await init();
  const kp = agentKeyPath();
  let signer;
  if (fs.existsSync(kp)) {
    signer = signerFromPrivateKey(fs.readFileSync(kp, 'utf8').trim());
  } else {
    signer = createPrivateKeySigner();
    fs.writeFileSync(kp, signer._privateKey, { mode: 0o600 });
  }
  const created = await client.createWallet({ signer });
  const wallet = { address: created.address };
  _agent = { wallet, signer: created.signer || signer };
  return _agent;
}

function sessionPublic(s) {
  if (!s) return null;
  return {
    walletAddress: s.walletAddress,
    publicKey: s.publicKey,
    permissions: s.permissions || null,
    expiry: s.expiry || null,
  };
}

// Grant a scoped session key. `permissions` = { calls?: [{to?,signature?}], spend?: [{limit,period,token?}] }.
// `expirySeconds` = unix epoch seconds (default 30 days). Registers in Keystore by default.
async function grantSession(permissions, expirySeconds) {
  const { client } = await init();
  const { wallet, signer } = await getAgentWallet();
  const session = await client.grantSession({
    wallet,
    signer,
    permissions: {
      calls: (permissions && permissions.calls && permissions.calls.length) ? permissions.calls : undefined,
      spend: (permissions && permissions.spend && permissions.spend.length)
        ? permissions.spend.map(s => ({ limit: BigInt(s.limit), period: s.period, token: s.token }))
        : undefined,
    },
    expiry: expirySeconds || Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    register: true,
  });
  _session = session;
  return session;
}

// Idempotent Keystore registration (lazy counterpart to grantSession register:false).
async function registerSession(session) {
  const { client } = await init();
  const { wallet, signer } = await getAgentWallet();
  return client.registerSessionKey({ wallet, signer, session: session || _session });
}

// Live on-chain txn through the session key. `calls` = [{ to, value?, data? }].
async function executeViaSession(calls, session) {
  const { client } = await init();
  return client.execute({ session: session || _session, calls });
}

// On-chain revoke of the session key.
async function revokeSession(session) {
  const { client } = await init();
  const { wallet, signer } = await getAgentWallet();
  return client.revokeSession({ wallet, signer, session: session || _session });
}

// 0-value self-call — a real on-chain txn proving the session key works, moving no funds.
function selfCall() {
  return [{ to: _agent.wallet.address, value: 0n, data: '0x' }];
}

module.exports = {
  init, getAgentWallet, grantSession, registerSession, executeViaSession, revokeSession,
  selfCall, sessionPublic,
  currentSession: () => _session,
  currentWallet: () => (_agent ? _agent.wallet : null),
};
