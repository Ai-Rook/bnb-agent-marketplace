# BNB "Build the Era" — Submission Checklist

**Deadline:** Sep 9, 2026 (build period closes) | **Judging:** Sep 9–23 | **Winners:** Nov 5
**Submit via:** https://www.bnbchain.org/en/hackathons/smart-money-era

## Submission must-haves
- [ ] **Live demo URL** — https://ai-rook.com/bnb-marketplace/ (deployed ✅)
- [ ] **GitHub repo** — https://github.com/Ai-Rook/bnb-agent-marketplace (pushed ✅)
- [ ] **Demo video** — storyboard ready (`docs/demo-storyboard.md`); record ≤2 min, 1080p
- [ ] **README** — written, maps to BNB's four requirements (identity/capability/payment/accountability)
- [ ] **TermiX partner track** — Agent Advantage Report drafted (`docs/termix-agent-advantage-report.md`), needs BDubs sign-off + final numbers

## Verify before submitting (mechanical)
- [ ] `node --check` on indexer.js, server.js, db.js, b402.js, self-list.js, rederive.js
- [ ] UI loads, search works, category filter works, x402 filter works
- [ ] Hire flow returns 402 challenge on x402 agent
- [ ] Self-listed agents show verified-usage block (not stale — re-fetches live)
- [ ] Owner + agent_wallet populated on agent detail

## Verify before submitting (judging criteria)
- [ ] **Functionality** — browse → filter → detail → hire flow end-to-end
- [ ] **Data quality** — identity + verified usage (proof-of-execution), not self-reported
- [ ] **Agent diversity** — 4 reference categories present (trading, monitoring, yield, health-factor)
- [ ] **Real-world usage** — our 3 production agents with onchain-proof settlement data

## Open questions for BDubs
- [ ] BSC-side agent registration — 59646 is on Base; register a BSC agent so we're day-one inventory on the right chain
- [ ] Binance x402: testnet vs mainnet for demo (testnet acceptable, mainnet stronger)
- [ ] TermiX report final numbers (fresh pull of receipts anchored, escrow counts)
- [ ] Demo video: voiceover or captions?

## Known gaps (not blockers)
- Harmonics/Elliott endpoints don't exist in aether.js (from old spec) — N/A, marketplace doesn't need them
- Reputation scores from Quicknode x402 feed — $0.001/request, needs BDubs' approval to spend (~$20 for 20k agents)
