// roundtrip.mjs — full b402 round-trip on BSC mainnet.
// Swaps USDT→$U into a fresh buyer (if short), buyer signs EIP-3009 on $U, POSTs
// X-PAYMENT to /api/hire → self-hosted Altana merchant verifies + settles.
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, maxUint256, parseGwei, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { buildEip3009TypedData, encodeXPaymentHeader } from '@altananetwork/sdk';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const RPC = 'https://bsc-dataseed1.binance.org';
const U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const HIRE = 'http://localhost:3061/api/hire';

const merchantKey = readFileSync('/opt/bnb-marketplace/bsc-wallet.key', 'utf8').trim();
const buyerKey = process.env.BUYER_KEY;
if (!buyerKey) { console.error('set BUYER_KEY (0x…)'); process.exit(1); }

const merchant = privateKeyToAccount(merchantKey);
const buyer = privateKeyToAccount(buyerKey);
const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
const walletClient = createWalletClient({ chain: bsc, transport: http(RPC) });

const ERC20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint,address[]) view returns (uint[])',
  'function swapExactTokensForTokens(uint,uint,address[],address,uint) returns (uint[])',
]);

const AMOUNT = parseUnits('0.01', 18); // $0.01 (18-dec $U)

async function readU(address) {
  return publicClient.readContract({ address: U, abi: ERC20, functionName: 'balanceOf', args: [address] });
}

async function main() {
  console.log('merchant:', merchant.address);
  console.log('buyer:   ', buyer.address);

  // ── fund the buyer with $U if short ──
  const buyerU = await readU(buyer.address);
  console.log('buyer $U:', formatUnits(buyerU, 18));
  if (buyerU < AMOUNT) {
    const approveHash = await walletClient.writeContract({
      address: USDT, abi: ERC20, functionName: 'approve',
      args: [ROUTER, maxUint256], account: merchant, gas: 100000n, gasPrice: parseGwei('3'),
    });
    console.log('approve tx:', approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const amountIn = parseUnits('1.5', 18); // USDT (18-dec)
    const path = [USDT, U];
    const amounts = await publicClient.readContract({ address: ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, path] });
    const minOut = amounts[1] * 97n / 100n;
    const swapHash = await walletClient.writeContract({
      address: ROUTER, abi: ROUTER_ABI, functionName: 'swapExactTokensForTokens',
      args: [amountIn, minOut, path, buyer.address, BigInt(Math.floor(Date.now()/1000) + 1200)],
      account: merchant, gas: 300000n, gasPrice: parseGwei('3'),
    });
    console.log('swap tx:', swapHash);
    await publicClient.waitForTransactionReceipt({ hash: swapHash });
    console.log('buyer $U after swap:', formatUnits(await readU(buyer.address), 18));
  } else {
    console.log('buyer already funded, skipping swap');
  }

  // ── sign EIP-3009 on $U (buyer) ──
  const now = Math.floor(Date.now() / 1000);
  const validBefore = now + 300;
  const nonce = `0x${randomBytes(32).toString('hex')}`;
  const typedData = buildEip3009TypedData({
    chainId: 56, token: U, name: 'United Stables', version: '1',
    from: buyer.address, to: merchant.address, value: AMOUNT, validAfter: 0n, validBefore: BigInt(validBefore), nonce,
  });
  const signature = await buyer.signTypedData(typedData);
  const inner = { signature, authorization: { from: buyer.address, to: merchant.address, value: AMOUNT.toString(), validAfter: '0', validBefore: validBefore.toString(), nonce } };
  const accepted = { scheme: 'exact', network: 'eip155:56', asset: U, payTo: merchant.address, amount: AMOUNT.toString(), maxTimeoutSeconds: 300, extra: { name: 'United Stables', version: '1', assetTransferMethod: 'eip3009' } };
  const header = encodeXPaymentHeader({ x402Version: 2, scheme: 'exact', network: 'eip155:56', accepted, resource: { url: 'https://ai-rook.com/bnb-marketplace/', description: 'Hire an agent on BNB Agent Studio', mimeType: 'application/json' }, payload: inner });

  // ── POST X-PAYMENT to /api/hire ──
  const agentId = process.env.AGENT_ID || '-59646';
  const res = await fetch(HIRE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PAYMENT': header }, body: JSON.stringify({ agent_id: parseInt(agentId, 10), task: 'roundtrip test' }) });
  const text = await res.text();
  console.log('hire status:', res.status);
  console.log('hire body:', text.slice(0, 500));
  console.log('merchant $U after settle:', formatUnits(await readU(merchant.address), 18));
}
main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1); });
