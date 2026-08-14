// payer.mjs — b402 EIP-3009 payer (buyer) for the marketplace hire flow.
// Ready-to-run: needs a funded payer wallet + the merchant onboarding creds on the SERVER.
//
// Usage:
//   PAYER_PRIVATE_KEY=0x... HIRE_URL=http://localhost:3061/api/hire node payer.mjs
//
// Flow: GET /api/hire (no payment) → 402 challenge (USDT, eip155:56, facilitator)
//       → signs an EIP-3009 "Transfer With Authorization" → retries → server verify/settle.
// EIP-3009 needs no ERC-20 approval (that's the point — USDT BSC supports transferWithAuthorization).
import { x402Client } from '@x402/core/client';
import { B402ExactClientScheme } from '@bnb-chain/b402/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';

const PAYER_KEY = process.env.PAYER_PRIVATE_KEY;
const HIRE_URL = process.env.HIRE_URL || 'http://localhost:3061/api/hire';
const AGENT_ID = parseInt(process.env.AGENT_ID || '59646', 10);

if (!PAYER_KEY) {
  console.error('Set PAYER_PRIVATE_KEY (0x…). The payer needs USDT on BSC mainnet to cover the $0.50 hire.');
  process.exit(1);
}

const account = privateKeyToAccount(PAYER_KEY);
console.log('payer:', account.address);

const payments = new x402Client().register(
  'eip155:*',
  new B402ExactClientScheme({ account, methods: ['eip3009'] }),
);
const fetch402 = wrapFetchWithPayment(fetch, payments);

const res = await fetch402(HIRE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_id: AGENT_ID, task: 'demo hire', idempotency_key: 'demo-' + Date.now() }),
});

const text = await res.text();
console.log('status:', res.status);
console.log('body:', text.slice(0, 500));
if (res.status === 200) {
  const data = JSON.parse(text);
  console.log('settle tx:', data?.settlement?.transaction);
  console.log('BSC anchor:', data?.receipt?.bsc_anchor);
}
