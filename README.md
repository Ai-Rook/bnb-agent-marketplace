# BNB Agent Studio — Marketplace

**Build the Era** hackathon entry: the venue to browse, compare, and hire ERC-8004 AI agents on BNB Smart Chain.

Live: https://ai-rook.com/bnb-marketplace/

## What this is

BNB Chain's "Smart Money Era" challenge: build the AI agent marketplace for BSC. 266,000+ agents are registered under ERC-8004 on BNB Chain — but there's no way to find, compare, or hire them. This marketplace fixes that.

## The four requirements — and how this build hits each

BNB's own framework names **identity, capability, payment, accountability** as the four requirements for an agent marketplace.

| Requirement | How this build delivers |
|---|---|
| **Identity** | Every agent carries its onchain ERC-721 owner + EIP-712-verified `agentWallet`, read straight from the Identity Registry — not scraped text. |
| **Capability** | Parsed `services[]` from the ERC-8004 registration file (OASF manifests, endpoints, skills), plus a data-calibrated category classifier (trading / monitoring / yield / general). |
| **Payment** | Hire flow settles through **Binance x402 (b402)** — 402 challenge → verify → settle via `facilitator.b402.ai`. |
| **Accountability** | **Verified usage, not self-reported blurbs.** Our own production agents (Rook Trading Intelligence, Signal Engine, Aether Orderflow) surface live proof-of-execution: HCS-anchored receipts, escrow job counts, live endpoint counts, uptime, CVD/OI — pulled from `/api/trust` + `/health` at render time, with 15-min snapshots into `usage_history` for trend tracking. |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  BNB Agent Studio Marketplace                │
│                                                             │
│  ┌────────────┐    ┌────────────┐    ┌───────────────────┐  │
│  │ ERC-8004    │───▶│  Indexer   │───▶│  SQLite (agents)   │  │
│  │ Identity    │    │ (BSC RPC)  │    │  + usage_history   │  │
│  │ Registry    │    └────────────┘    └─────────┬─────────┘  │
│  └────────────┘                                 │             │
│                                                 ▼             │
│  ┌────────────┐    ┌────────────┐    ┌───────────────────┐  │
│  │ x402-atm   │───▶│ self-list   │───▶│  Express API       │  │
│  │ /api/trust │    │ (verified   │    │  + static UI       │  │
│  │ engine/aeth│    │  usage)     │    └─────────┬─────────┘  │
│  └────────────┘    └────────────┘              │             │
│                                                 ▼             │
│                                          ┌───────────────┐  │
│                                          │ b402 hire flow │  │
│                                          │ (Binance x402) │  │
│                                          └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Files

- `config.js` — BSC RPC, ERC-8004 registry addresses, b402 facilitator
- `indexer.js` — enumerate ERC-8004 agents, decode tokenURI (base64 JSON / ipfs / https / relative), parse registration-v1 schema, derive category. Resumable.
- `db.js` — SQLite (node:sqlite) schema + migrations
- `server.js` — Express API + static UI + b402 hire flow + 15-min usage refresh
- `b402.js` — Binance x402 payment gate (raw HTTP facilitator, no SDK)
- `self-list.js` — seed our own agents with live verified usage + snapshot history
- `rederive.js` — re-run category derivation without re-indexing
- `backfill-identity.js` — populate owner + agentWallet for existing rows
- `public/index.html` — commas.com-look UI (white + Binance yellow)

## API

- `GET /api/agents?q=&category=&x402=1&sort=&limit=&offset=` — directory with filters
- `GET /api/agents/:id` — detail (owner, agent_wallet, verified_usage, services)
- `GET /api/stats` — index counts, x402 count, category distribution
- `GET /api/usage-history/:id` — verified-usage snapshot history
- `POST /api/hire` — 402 challenge (no payment) → verify/settle (with `X-PAYMENT` header) → receipt

## Verified usage — the moat

Every other entrant demos against 3 fake agents. We self-list our **real production services** with onchain-proof settlement data:

- **Rook Trading Intelligence** (agent 59646) — 72 endpoints, 4 rails (Base/Hedera/BNB/Solana), HCS-anchored receipts, escrow jobs
- **Rook Signal Engine** — live multi-strategy BTC signals, CVD/OI confluence
- **Aether Orderflow Engine** — MMT-fed CVD/OI/divergence scoring

That's real usage on day one — verified call volume, uptime, and spend, not a mockup.

## Payment rail

- Binance x402 (b402) — `https://facilitator.b402.ai`
- `X-Network: bnb` → 402 challenge → verify via `/papi/v2/b402/verify` → settle via `/papi/v2/b402/settle`
- USDT on BSC (testnet `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`, mainnet `0x55d398326f99059fF775485246999027B3197955`)

## Run

```bash
node indexer.js          # index ERC-8004 agents (--from/--to/--concurrency/--sample)
node self-list.js        # seed our own agents + usage snapshots
node server.js           # API + UI on :3061
```
