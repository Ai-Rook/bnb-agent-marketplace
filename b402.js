// b402.js — Binance x402 (b402) payment gate for the marketplace hire flow
// Reuses the raw-HTTP facilitator pattern proven on x402-atm (no @b402/sdk on npm).
'use strict';

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

async function verifySettle(paymentHeader) {
  // Returns { ok, settleTx, payer, error }
  const decoded = decodePaymentSignatureHeader(paymentHeader);
  if (!decoded) return { ok: false, error: 'Invalid payment signature format' };

  const requirements = buildRequirements();

  // Verify via b402 facilitator
  let verifyData;
  try {
    const verifyResp = await fetch(config.b402Facilitator + '/papi/v2/b402/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: decoded,
        paymentRequirements: requirements,
        x402Version: 2,
      }),
      signal: AbortSignal.timeout(15000),
    });
    verifyData = await verifyResp.json();
  } catch (e) {
    return { ok: false, error: 'BNB verification unavailable: ' + e.message };
  }

  if (!verifyData?.isValid) {
    return { ok: false, error: verifyData?.invalidReason || 'BNB payment verification failed' };
  }

  // Settle via b402 facilitator — fail closed
  let settleData;
  try {
    const settleResp = await fetch(config.b402Facilitator + '/papi/v2/b402/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: decoded,
        paymentRequirements: requirements,
        x402Version: 2,
      }),
      signal: AbortSignal.timeout(15000),
    });
    settleData = await settleResp.json();
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
