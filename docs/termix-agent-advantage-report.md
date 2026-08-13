# TermiX Agent Advantage Report — Draft

**Track:** TermiX $10K — "does hiring an agent beat doing it yourself, and can you prove it?"
**Prepared for:** BNB Chain "Build the Era" (Sep 9 deadline)
**Status:** DRAFT — needs BDubs' review + final numbers before submission

---

## Thesis

Hiring an agent from the Rook marketplace beats doing it yourself because the agent carries
**verified, onchain-accountable track record** — not a promise. This report compares three real
tasks run with vs. without an agent, using production data from Rook's own live services.

---

## Task 1 — Market monitoring / signal generation

**Without an agent:** A human scans charts for BTC setups. Realistically ~2–4 focused hours/day,
and you still can't watch CVD, OI, and order flow across 4 timeframes simultaneously, 24/7.

**With an agent (Rook Signal Engine):** Multi-strategy engine watches BTC perpetually. Live
strategies: S10, S10_CONVICTION, YAHTZEE, S14, BOJAN, GHOST (+ S21/S22 in dev). Each candidate is
scored against CVD direction, OI, HTF bias, and structure — logged, not vibes.

**Proof:** engine `/health` exposes active trades, live strategy list, CVD/OI state, and price
spread at any moment. This is the same data surfaced in the marketplace's "verified usage" block.

**Advantage:** Coverage (24/7 multi-factor vs. human 2–4h single-factor) + consistency (rule-based
scoring vs. fatigue/emotion).

---

## Task 2 — Strategy validation (does the edge actually exist?)

**Without an agent:** A trader backtests by hand — weeks of spreadsheets, or trusting gut feel.
Most retail edges are never actually validated before real money goes in.

**With an agent (backtested strategy library):** Rook's S7 Mode B is the canonical example —
762 trades, 74% win rate, +$114k, profit factor 12.48 over a 6-month bear market (validated
2026-03-31). The marketplace lists agents with their category + onchain identity so you can see
*before hiring* whether an agent's claimed strategy has evidence behind it.

**Proof:** backtest results in Rook's memory (`MEMORY.md`, 2026-03-31) + the ERC-8004 reputation
registry attestation for agent 59646.

**Advantage:** Evidence-before-hire vs. trust-me. This is the entire point of the marketplace —
accountability, not a pretty directory.

---

## Task 3 — Data gathering / execution with settlement proof

**Without an agent:** Pull market data from 3 exchanges (3 API keys, 3 auth flows), then manually
track whether a paid call actually settled.

**With an agent (x402-atm):** 72 endpoints, 4 payment rails (Base/Hedera/BNB/Solana). Every paid
call returns a receipt anchored on Hedera HCS — proof-of-execution, not a "trust me it ran."
19 escrow jobs created, 0 disputes, first service day 2026-07-24.

**Proof:** `GET /api/trust` returns identity (ERC-8004 agent 59646), age proof (HCS topic
0.0.10788411, created 2026-07-31), activity (receipts anchored, escrow counts, disputes "0 of 19"),
and independent verification links (HashScan, Basescan, x402scan).

**Advantage:** Settled-and-anchored vs. take-my-word-for-it. Machine-verifiable in seconds.

---

## The pattern

All three tasks show the same thing: the agent wins not because it's smarter, but because it's
**auditable**. The marketplace's four pillars (identity, capability, payment, accountability) are
what let a person *see* that audit trail before spending — which is precisely what BNB's framework
asks for.

## Remaining before submission
- [ ] BDubs review/approve the framing
- [ ] Confirm final numbers (engine trade count, receipts anchored — pull fresh at submission time)
- [ ] Map to TermiX's exact "≥3 real tasks with vs without agent" format + any template they require
