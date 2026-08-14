// b402.js — Binance x402 (b402) payment gate for the marketplace hire flow
// Reuses the raw-HTTP facilitator pattern proven on x402-atm (no @b402/sdk on npm).
'use strict';

const crypto = require('crypto');
const config = require('./config');
const { decodePaymentSignatureHeader } = require('@x402/core/http');

const chainId = config.bnbNetwork === 'bsc' ? 56 : 97;
const eip155 = 'eip155:' + chainId;
const usdt = chainId === 56 ? config.usdtMainnet : config.usdtTestnet;

// Per-agent hire price (USDT atomic units, 6 decimals) — $0.50 flat for demo
const HIRE_PRICE_ATOMIC = '500000';

function buildRequirements(amountAtomic = HIRE_PRICE_ATOMIC) {
  return {
    scheme: 'exact',
    network: eip155,
    amount: amountAtomic,
    asset: usdt,
    payTo: config.bnbPayTo,
    maxTimeoutSeconds: 300,
    extra: {
      name: 'Tether USD',
      version: '1',
      assetTransferMethod: 'eip3009',
      signerAddress: config.bnbPayTo,
    },
  };
}

function paymentChallenge(description) {
  const accepts = [buildRequirements()];
  return {
    x402Version: 2,
    accepts,
    description: description || 'Hire this agent via Binance x402',
    network: eip155,
  };
}

// ── Binance b402 facilitator — "Tesla" RSA request signing ────────────────
// The official facilitator is authenticated: every /verify + /settle request is
// signed with the merchant's RSA key issued at onboarding. Creds come from env:
//   B402_BASE_URL, B402_CLIENT_ID, B402_ACCESS_TOKEN, B402_PRIVATE_KEY (or _B64)
function loadRsaKey(pem) {
  const t = String(pem).trim();
  if (t.includes('-----BEGIN')) return crypto.createPrivateKey({ key: t, format: 'pem' });
  const decoded = Buffer.from(t, 'base64');
  if (decoded.toString('utf8', 0, 11) === '-----BEGIN ') return crypto.createPrivateKey({ key: decoded.toString('utf8'), format: 'pem' });
  return crypto.createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
}

function teslaSign(privateKey, body, timestamp) {
  return crypto.createSign('RSA-SHA256').update(body + timestamp, 'utf8').end().sign(loadRsaKey(privateKey), 'base64');
}

async function b402Post(path, payload) {
  const baseUrl = process.env.B402_BASE_URL || config.b402Facilitator;
  const clientId = process.env.B402_CLIENT_ID;
  const accessToken = process.env.B402_ACCESS_TOKEN;
  const privateKey = process.env.B402_PRIVATE_KEY || process.env.B402_PRIVATE_KEY_B64;
  if (!baseUrl || !clientId || !accessToken || !privateKey) {
    throw new Error('b402 merchant onboarding not configured — set B402_BASE_URL, B402_CLIENT_ID, B402_ACCESS_TOKEN, B402_PRIVATE_KEY');
  }
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = teslaSign(privateKey, body, timestamp);
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tesla-ClientId': clientId,
      'X-Tesla-SignAccessToken': accessToken,
      'X-Tesla-Timestamp': timestamp,
      'X-Tesla-Signature': signature,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('b402 ' + path + ': non-JSON response: ' + text.slice(0, 200)); }
  if (!res.ok) throw new Error('b402 ' + path + ': HTTP ' + res.status + ' ' + text.slice(0, 200));
  if (envelope.code !== '000000') throw new Error('b402 ' + path + ': code ' + (envelope.code || '(none)') + ' — ' + (envelope.message || 'no message'));
  return envelope.data;
}

async function verifySettle(paymentHeader) {
  // Returns { ok, settleTx, payer, error }
  const decoded = decodePaymentSignatureHeader(paymentHeader);
  if (!decoded) return { ok: false, error: 'Invalid payment signature format' };

  const requirements = buildRequirements();
  const request = { paymentPayload: decoded, paymentRequirements: requirements, x402Version: 2 };

  // Verify via b402 facilitator (Tesla-signed)
  let verifyData;
  try {
    verifyData = await b402Post('/papi/v2/b402/verify', request);
  } catch (e) {
    return { ok: false, error: 'BNB verification unavailable: ' + e.message };
  }

  if (!verifyData?.isValid) {
    return { ok: false, error: verifyData?.invalidReason || 'BNB payment verification failed' };
  }

  // Settle via b402 facilitator — fail closed
  let settleData;
  try {
    settleData = await b402Post('/papi/v2/b402/settle', request);
  } catch (e) {
    return { ok: false, error: 'BNB settlement failed: ' + e.message };
  }

  if (!settleData || settleData.success !== true || !settleData.transaction) {
    return { ok: false, error: 'BNB settlement failed or unconfirmed' };
  }

  return {
    ok: true,
    settleTx: settleData.transaction,
    payer: verifyData.payer || '',
    network: eip155,
  };
}

module.exports = { paymentChallenge, verifySettle, buildRequirements, eip155, usdt, chainId };
