# Spoke AI — Partner Pitch

*Trade the wheel, smarter.*

**For:** Tradier and Alpaca partnerships teams
**From:** Spoke AI
**Date:** 2026-05-14
**Companion doc:** [`brokerage-evaluation.md`](./brokerage-evaluation.md) (internal evaluation; not for distribution)

---

## What we are

**Spoke AI** is a focused web dashboard for retail options traders running **the wheel** — cash-secured puts on tickers they want to own, covered calls on the resulting shares, and disciplined rolls. The product does three things well:

1. **Screens** option chains for high-yield, near-the-money cash-secured-put candidates and ranks them by annualized return.
2. **Tracks** open positions with IV rank trends, earnings dates, near-expiry alerts, and a roll-suggestion engine that proposes the next leg.
3. **Journals** every closed trade so users can see realized yield, win rate, and per-ticker performance over time.

Today we run on a delayed market-data feed for screening. The next milestone is **live execution against the user's own brokerage account** — which is why we're talking to you.

## Who uses it

Self-directed retail options traders, Level 2–3, mostly US-based, comfortable with a Robinhood-style "preview → confirm" ticket. Two segments:

- **Income-focused wheelers** running 5–25 concurrent positions on liquid large caps and ETFs.
- **Active rollers** who want one-screen visibility into roll opportunities before expiration Friday.

These users **already hold a brokerage account** (or will open one if the integration is good). They are not looking to switch primary brokers — they want a better cockpit on top of the broker they trust.

## Year-one volume estimate

These are planning numbers, not commitments — we'd rather under-promise here than oversell.

| Metric | Conservative | Target |
|---|---|---|
| Total registered users (EOY 1) | 5,000 | 15,000 |
| Monthly active users | 1,500 | 5,000 |
| Users who connect a brokerage account | 600 | 2,500 |
| Net new brokerage accounts opened *because of* the dashboard | 150 | 750 |
| Avg options contracts/month per active connected user | 20–40 | 20–40 |

Funnel assumption: ~40% of MAU connect a brokerage; of those, ~25% need to open a fresh account with the partner broker rather than link an existing one.

## How we make money

Subscription SaaS, paid by the end user to us:

- **Free** — screener with delayed data, journaling, 1 connected position.
- **Pro ($15/mo or $144/yr)** — live screener, unlimited positions, roll engine, alerts, broker connection.
- **Future Team tier** — small advisor/coaching groups; not in year-one scope.

We do **not** monetize order flow, spreads, or float, and we have no plans to. That keeps incentives aligned with the user and keeps the regulatory footprint small.

## Why we'd be a good partner

- **Right-shaped users.** Options-literate, account-funded, multi-trade-per-month — the cohort partners actually want, not signal-chasers who open and abandon accounts.
- **We bring the UX, you bring the rails.** We have no interest in becoming a broker. We want to be the best cockpit *on top of* your brokerage, with co-brandable account-linking.
- **Net account openings, not just linking.** A meaningful share of our growth is users who don't yet have an account at the partner broker and will open one to use live features.
- **Engineering quality.** Existing dashboard ships with typed APIs, automated tests around the positions and roll endpoints, structured logs, and a sandbox-first integration plan — we will not be a support burden.
- **Single integration to start.** We're choosing one launch partner, not maintaining three half-built ones, so the integration we ship will be exercised by every paying user.

## What we'd like from this call

Three concrete asks, in priority order:

1. **Sandbox + production OAuth approval path.** Confirmation we can build against your sandbox immediately and a clear, time-boxed checklist for production OAuth review.
2. **Partner pricing or rev-share, if any exists.** Whatever ISV / referral / SaaS-discount program you have for products in our shape — even an informal one. We're happy to share funnel data to qualify.
3. **Intro to the right humans.** A named partner-engineering or solutions contact, plus a compliance/legal contact for the agreement review. One of each is enough.

A 30-minute follow-up after this pitch is plenty — we'll come with the specific technical and commercial questions documented in our internal evaluation.

---

## Short version (paste into first outreach email)

> Hi [name],
>
> I'm building **Spoke AI** — a focused web cockpit for retail options traders running the wheel (cash-secured puts → assignment → covered calls → roll). It screens chains for high-yield candidates, tracks positions with IV-rank and earnings context, suggests rolls, and journals closed trades.
>
> We're now picking one brokerage partner for live execution and [Tradier / Alpaca] is at the top of our list. Year-one planning has us at ~5k MAU, ~2.5k connected accounts, and a few hundred net-new accounts opened with the partner. Monetization is pure SaaS subscription on our side — no PFOF, no spread capture.
>
> Could we get 30 minutes to cover three things: (1) sandbox access and the production-OAuth path, (2) any ISV / referral / partner-pricing program that fits a SaaS dashboard sitting on top of customer-owned accounts, and (3) intros to the right partner-engineering and compliance contacts?
>
> Happy to send a one-pager ahead of the call.
>
> Thanks,
> [name]
