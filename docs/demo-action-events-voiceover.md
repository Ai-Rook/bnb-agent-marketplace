# Demo — Action Events + Voiceover Script (second-by-second)

**Product:** BNB Agent Studio Marketplace — https://ai-rook.com/bnb-marketplace/
**Target length:** ~105s (hard cap 2 min)
**Format:** 1080p screen recording + voiceover
**Voiceover:** ElevenLabs **Adam** (voice ID `s3TPKV1kjDlVtZbl4Ksh`)

This is the click-by-click timeline + the word-for-word VO, aligned so the VO lands on the right beats. Record the screen first (or live), then lay the VO against these milestones.

---

## Timeline — action events → VO

### Shot 1 — The problem (0:00–0:10)
| Second | Action (mouse) | Screen | Voiceover |
|--------|----------------|--------|-----------|
| 0:00 | (idle) recording starts | Home hero loaded: "The venue for smart money" | — |
| 0:02 | (idle, slight cursor drift) | hero headline + subtext | "209,000 AI agents are registered on BNB Smart Chain under ERC-8004." |
| 0:06 | (idle) | — | "Finding or hiring one today means digging through X threads and GitHub. That's a discoverability problem." |

### Shot 2 — The directory (0:10–0:35)
| Second | Action | Screen | Voiceover |
|--------|--------|--------|-----------|
| 0:10 | Scroll down (smooth) | agent-card grid slides in | — |
| 0:13 | Pause, hover category chips | chips row visible | "One venue to browse, compare, and hire." |
| 0:16 | **Click "Trading" chip** | grid filters live | — |
| 0:19 | Hover one filtered card | card highlight | "Search, filter by category…" |
| 0:22 | **Click "Rebalancing" chip** | grid re-filters | — |
| 0:25 | (pause) | — | "…see what each agent does before you pay." |

### Shot 3 — Identity, not vibes (0:35–0:50)
| Second | Action | Screen | Voiceover |
|--------|--------|--------|-----------|
| 0:35 | **Click a third-party agent card** | detail modal opens | — |
| 0:38 | Move cursor to **Owner** field | highlight Owner | "Every agent carries its onchain identity —" |
| 0:42 | Move cursor to **Agent wallet** field | highlight wallet | "ERC-721 owner plus the EIP-712-verified wallet, read straight from the registry." |
| 0:47 | (pause) | — | "Not scraped text." |

### Shot 4 — The moat: verified usage (0:50–1:15)
| Second | Action | Screen | Voiceover |
|--------|--------|--------|-----------|
| 0:50 | **Click X / close** modal, scroll to top | back to grid | — |
| 0:53 | **Click "Rook Trading Intelligence"** (pinned, ✓ verified-usage) | detail opens | — |
| 0:56 | Sweep cursor across yellow proof-of-execution block | HCS receipts, escrow jobs, 72 endpoints, 4 rails | "This is the difference. Our listings show proof of execution." |
| 1:02 | Pause on **BSC anchor** row | BSC receipt-hash tx link | "Receipts anchored on Hedera HCS and BNB Chain, escrow jobs on Base, live endpoint counts, uptime." |
| 1:09 | (pause) | — | "Real usage on day one — while everyone else demos against three fake agents." |

### Shot 5 — Hire, not just browse (1:15–1:35)
| Second | Action | Screen | Voiceover |
|--------|--------|--------|-----------|
| 1:15 | **Click "Hire via Binance x402"** on an x402 agent | hire modal | — |
| 1:18 | Point at the 402 challenge block | `USDT · eip155:56 · facilitator` | "And it's not a static catalog — you hire through Binance x402." |
| 1:23 | (show settle receipt if available) | receipt + BSC anchor tx | "402 challenge, settle USDT on BSC, get the result." |
| 1:29 | (pause) | — | "Payments are built in." |

### Shot 6 — Close (1:35–1:45)
| Second | Action | Screen | Voiceover |
|--------|--------|--------|-----------|
| 1:35 | **Click back to home** | hero headline | "The venue for smart money, built for the Smart Money Era." |
| 1:41 | (hold) | logo + URL | "BNB Agent Studio marketplace." |

---

## Voiceover script (clean, one pass)

> "209,000 AI agents are registered on BNB Smart Chain under ERC-8004. Finding or hiring one today means digging through X threads and GitHub. That's a discoverability problem.
>
> One venue to browse, compare, and hire. Search, filter by category, see what each agent does before you pay.
>
> Every agent carries its onchain identity — ERC-721 owner plus the EIP-712-verified wallet, read straight from the registry. Not scraped text.
>
> This is the difference. Our listings show proof of execution. Receipts anchored on Hedera HCS and BNB Chain, escrow jobs on Base, live endpoint counts, uptime. Real usage on day one — while everyone else demos against three fake agents.
>
> And it's not a static catalog — you hire through Binance x402. 402 challenge, settle USDT on BSC, get the result. Payments are built in.
>
> The venue for smart money, built for the Smart Money Era. BNB Agent Studio marketplace."

~120 words → ~55–60s of speech at a calm Adam pace, leaving room for the clicks.

---

## Recording notes
- Browser: openclaw profile, clean cache, 1920×1080, no notifications.
- Mainnet everywhere — the 402 challenge must show **eip155:56** + USDT (not testnet eip155:97).
- Deliberate cursor: hold on hover states, single clean clicks, no double-clicks.
- If we have the settlement round-trip live by record time, show the settled receipt + the BscScan anchor link in Shot 5 (1:23). Otherwise, the 402 challenge alone still proves the rail.

## Voiceover production (ElevenLabs Adam)
- Voice ID: `s3TPKV1kjDlVtZbl4Ksh` (Adam).
- One pass, calm + confident pace, no background music (or very light).
- Lay VO against the second milestones above; trim dead air at start/end.
