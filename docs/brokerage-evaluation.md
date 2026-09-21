# Brokerage Partnership Evaluation: Tradier vs. Alpaca

**Audience:** Decision-maker choosing a brokerage partner for the Wheel Strategy Dashboard before any live-trade-execution work begins.
**Status:** Research only — no integration code is written. All claims below are tagged either **[public]** with a link, or **[needs confirm]** meaning a partnerships call is required to verify.
**Last reviewed:** 2026-05-14

---

## TL;DR Recommendation

**Recommended partner: Tradier.**

For a *wheel-strategy options* product whose users already have (or are willing to open) a brokerage account and want a Robinhood-style options trading UX, **Tradier Brokerage** is the better fit today because:

1. Options trading is a first-class, mature product on Tradier's API — multi-leg orders, full options chains with greeks, and per-contract pricing are all natively exposed. Alpaca's options API is newer and still maturing (Level 1–3 rolled out 2024; spreads/multi-leg coverage is narrower). **[needs confirm — verify current Alpaca multi-leg support at time of contracting]**
2. Tradier has a long-standing **"developer-first / BYO-account" model** with published flat-rate pricing ($10/mo unlimited equity + $0.35/contract on the Pro plan), which lets the dashboard offer a Robinhood-style UX *on top of* a customer's own Tradier account without us becoming an introducing broker. **[public — tradier.com/pricing]**
3. Alpaca is the better choice **only if** the long-term plan is to become a fully embedded broker-dealer-style product (Alpaca Broker API offers white-labeled, fully-disclosed accounts and revenue-share on PFOF, margin, and stock loan). That path requires far more compliance work and is overkill for a wheel-strategy dashboard at this stage. **[public — alpaca.markets/broker]**

If the product strategy ever pivots to "open an account inside our app, never leave," revisit this — Alpaca's Broker API wins that scenario.

---

## Side-by-side comparison

| Dimension | Tradier | Alpaca |
|---|---|---|
| Primary product for us | **Tradier Brokerage API** (BYO-account) | **Trading API** (BYO-account) or **Broker API** (embedded/white-label) |
| Options trading maturity | Mature; multi-leg, chains, greeks since launch **[public — documentation.tradier.com]** | Options launched 2024; Level 1–3 access; multi-leg support expanding **[public — docs.alpaca.markets/docs/options-trading]** **[needs confirm — current spread/4-leg coverage]** |
| Equities | Yes | Yes, plus fractional shares **[public — alpaca.markets]** |
| Crypto | No | Yes (separate API) **[public]** |
| Paper / sandbox | Yes — sandbox.tradier.com, free, full options simulation **[public]** | Yes — paper.alpaca.markets, free, generous **[public]** |
| Pricing to end user (BYO-account model) | $0 stock; $0.35/contract options; **$10/mo Pro removes per-trade equity commission and lowers other fees** **[public — tradier.com/pricing]** | $0 stock & ETF commissions; $0.50–$0.65/contract options for retail self-directed accounts **[public — alpaca.markets/pricing]** **[needs confirm — current options rate]** |
| Pricing to *us* (the developer) | Free API access at sandbox; production API tied to customer's brokerage account, no per-call fees **[public]** | Free Trading API; **Broker API has volume-based pricing and partnership terms** **[needs confirm]** |
| Rev-share to partners | **No public rev-share program for the BYO-account API.** Partners earn via subscription / their own SaaS pricing. **[needs confirm — any private referral or SaaS-discount program]** | **Broker API revenue-share** on PFOF, margin interest, stock loan, and fees; details only on partnership call **[public that program exists, terms needs confirm — alpaca.markets/broker]** |
| Partner support | Email + community Slack; partner engineering available for Pro accounts **[needs confirm — SLAs, dedicated rep tiers]** | Dedicated solutions engineer for Broker API customers; community Slack for Trading API **[needs confirm]** |
| Onboarding to integrate | Self-serve developer signup, OAuth app registration; production access requires app review **[public]** | Self-serve for Trading API; **Broker API requires sales call, KYC of the partner entity, BD/compliance review** **[public]** |
| White-label / embedded accounts | Limited — Tradier supports OAuth-based account linking; not a full white-label BD platform **[needs confirm]** | Yes — Broker API offers fully-disclosed and omnibus models, Alpaca acts as the carrying broker **[public]** |
| PFOF treatment | Tradier discloses PFOF on its 606 reports; partners do not share **[public — Tradier 606]** | Alpaca does not take PFOF on equities (per its public stance); options PFOF model exists for Broker API partners **[needs confirm — current options PFOF policy & rev-share %]** |
| Compliance burden on us | **Low** — customer holds the brokerage relationship. We are a SaaS tool. | **Low (Trading API)** / **High (Broker API — we'd need a written supervisory agreement, vendor due diligence, possibly RIA/IA registration)** **[needs confirm]** |
| Order-status push | WebSocket streaming for orders + market data **[public]** | WebSocket streaming for orders + market data **[public]** |
| Real-time market data | Included; OPRA options data add-on for non-pro users **[public]** | IEX free; SIP / OPRA paid tiers **[public]** |
| Min volume commitments | None known for API tier **[needs confirm]** | None for Trading API; **Broker API likely has minimums** **[needs confirm]** |
| Exclusivity clauses | None known **[needs confirm]** | **[needs confirm]** |
| Geography | US accounts; some intl support **[needs confirm]** | US + international (LATAM, EU via Alpaca entities) **[public]** |

---

## Tradier — detail

### Product offering
Tradier operates as a US broker-dealer (member FINRA/SIPC) that exposes its brokerage rails through a REST + streaming API. Two relevant products:
- **Tradier Brokerage API** — customer opens a Tradier account, our app authenticates via OAuth and places orders / reads positions on their behalf. **[public]**
- **Tradier Market Data API** — quotes, chains, historicals; can be used standalone. **[public]**

### Options trading capabilities
- Full options chains with greeks, IV, OI, volume **[public]**
- Single-leg and multi-leg orders (verticals, condors, calendars, straddles) — **directly relevant to wheel rolls** **[public]**
- Equity options + index options **[public]**
- Per-contract commission $0.35 (Pro plan); $0 on the per-trade equity side **[public]**

### Partnership program structure
Tradier's "partnership" is more accurately a **developer/ISV program**: the customer is Tradier's brokerage customer, and we are an authorized third-party app. There is no embedded-broker offering. **[public for the model; needs confirm for any formal "partner" tier with co-marketing or rev-share]**

### Revenue-share model
No public rev-share. Our monetization is our own SaaS subscription. Tradier's $10/mo Pro plan is paid by the customer, not split with us. **[needs confirm — whether a referral kickback exists privately]**

### Partner support
Documentation portal, developer Slack, and email support. Higher-tier partners reportedly get a named contact. **[needs confirm]**

### Onboarding / approval process
1. Create a developer account (free, instant)
2. Build against sandbox
3. Submit production OAuth app for review (security + UX checks)
4. Customers connect via OAuth on their own Tradier accounts
**[public — documentation.tradier.com]**

### Sandbox / paper trading
`sandbox.tradier.com` — free, simulated fills, full options chain, no real money. Quality is generally good for development. **[public]**

### Known limitations
- US accounts only (mostly) **[needs confirm]**
- Not a white-label / embedded-account platform — customer must explicitly hold a Tradier account
- Smaller brand recognition than larger brokers — some users may need education
- Options assignment / exercise notifications come through the standard order events stream; latency is acceptable but not "instant" **[needs confirm]**

---

## Alpaca — detail

### Product offering
Alpaca offers two distinct products. Choosing the wrong one is the most common mistake in this evaluation:
- **Trading API** — analogous to Tradier's BYO-account model. Customer opens an Alpaca account, our app trades on their behalf via OAuth. **[public]**
- **Broker API** — Alpaca acts as the *carrying* broker for accounts our app *originates*. We become the user-facing brand; Alpaca handles clearing, custody, and regulatory plumbing. This is what powers many "neobroker" apps. **[public — alpaca.markets/broker]**

### Options trading capabilities
- Options launched in 2024 with Level 1 and 2; Level 3 (spreads) rolled out subsequently **[public — docs.alpaca.markets/docs/options-trading]**
- Multi-leg support exists but the catalog of supported strategies is narrower than Tradier's; **confirm 4-leg / iron condor / calendar support at time of contracting** **[needs confirm]**
- Greeks/chains available
- Per-contract commission $0.50–$0.65 retail; partner pricing on Broker API **[needs confirm — current rate]**

### Partnership program structure
- Trading API: self-serve, no formal partnership
- **Broker API: a real partnership program** with sales engagement, BD-style due diligence on the partner, and a tiered relationship. This is where rev-share lives. **[public]**

### Revenue-share model (Broker API only)
Alpaca shares revenue with Broker API partners on:
- Order flow (PFOF, where applicable) **[needs confirm — exact splits and which asset classes]**
- Margin interest spread **[needs confirm]**
- Stock loan / fully-paid securities lending **[needs confirm]**
- Float / cash sweep **[needs confirm]**
Specific percentages are not published and are negotiated per partner. **[needs confirm]**

### Partner support
Trading API: docs + community Slack. Broker API: dedicated solutions engineer + compliance contact during onboarding. **[needs confirm — ongoing SLA after launch]**

### Onboarding / approval process
- Trading API: self-serve, days **[public]**
- Broker API: weeks-to-months — entity KYC, written supervisory procedures review, contract negotiation, integration certification **[public]**

### Sandbox / paper trading
`paper.alpaca.markets` — free, well-regarded; supports both APIs. **[public]**

### Known limitations
- Options API maturity vs. Tradier (catching up but not at parity for advanced multi-leg) **[needs confirm]**
- Broker API pulls us into a much heavier compliance posture; not justified at our current stage
- Documentation for advanced options scenarios (assignment notifications, expiration handling) is thinner than Tradier's **[needs confirm]**

---

## Robinhood-style UX fit

The Robinhood trading experience boils down to a small set of core flows. Below is how each broker's API supports them for *our* use case (a wheel-strategy dashboard where users see candidates, then act).

| Robinhood-style flow | Tradier | Alpaca |
|---|---|---|
| **One-tap buy/sell (equities)** — single REST call, optimistic UI, status push | ✅ Native: `POST /v1/accounts/{id}/orders` + WebSocket order stream **[public]** | ✅ Native: `POST /v2/orders` + WebSocket **[public]** |
| **Options chain browsing with quick-select strikes** — single endpoint returning a full chain with greeks, IV, OI, sorted by strike/expiry | ✅ `GET /v1/markets/options/chains` returns full chain with greeks in one call **[public]** | ⚠️ Available, but greeks/IV require the options snapshot endpoint and the response shape requires more client-side assembly **[needs confirm — current shape]** |
| **Single-screen order ticket (preview → confirm)** | ✅ `POST .../orders/preview` for cost/buying-power preview, then submit **[public]** | ⚠️ No first-class "preview" endpoint for options at parity with Tradier; we'd compute cost client-side **[needs confirm]** |
| **Instant order status (push)** | ✅ WebSocket order events **[public]** | ✅ WebSocket order events **[public]** |
| **Position cards with real-time P/L** | ✅ Positions endpoint + streaming quotes; cost basis included **[public]** | ✅ Positions endpoint + streaming quotes **[public]** |
| **Multi-leg order ticket (wheel rolls — close short put + open new short put as one order)** | ✅ Native multi-leg orders accepted as a single ticket **[public]** | ⚠️ Supported for the strategies Alpaca currently lists; **confirm coverage of roll-as-single-order** **[needs confirm]** |
| **Recurring / scheduled actions (e.g., "sell a put every Friday")** | ❌ Not native — we'd schedule server-side and submit on the day **[public]** | ❌ Not native (recurring investments exist for equities on Broker API consumer apps but not for options) **[needs confirm]** |
| **Fractional shares (relevant if we ever add equity wheels for high-priced names)** | ❌ Not supported **[public]** | ✅ Supported on Trading & Broker APIs **[public]** |
| **Instant funding / ACH visualization** | ⚠️ ACH transfers via API, but "instant deposit" is a Robinhood proprietary product — Tradier shows pending until cleared **[public]** | ⚠️ Same: ACH visible via API; "instant" is not a thing unless we front it ourselves on Broker API **[needs confirm]** |
| **In-app account opening (if we ever want it)** | ❌ Not in scope for Tradier's API **[public]** | ✅ Broker API only **[public]** |
| **Push notifications on assignment / expiration** | ⚠️ Surfaced via order events stream; we transform and notify **[public]** | ⚠️ Same pattern **[needs confirm — assignment event timing]** |

### What this means for our product
- For the **wheel-specific flows** (browse cash-secured-put candidates → preview → submit → watch fill → see position card → roll as single multi-leg ticket), **Tradier supports every flow natively today**. Alpaca supports most but with more client-side glue and some open questions around multi-leg roll tickets.
- The two flows we cannot get *natively* from either broker — recurring/scheduled options orders, and "instant" deposits — are scheduler features we'd build ourselves regardless of broker.
- Fractional shares are an Alpaca-only win, but they are **irrelevant to a wheel-strategy options product** (options trade in 100-share contract units).
- In-app account opening is an Alpaca-Broker-API-only capability and is **out of scope** for the current product strategy.

---

## Recommendation (expanded)

**Use Tradier Brokerage API** as the broker partner for live execution.

Reasons, ranked:
1. **Options-first API maturity.** A wheel dashboard lives or dies on options ergonomics — chains, greeks, multi-leg rolls, assignments. Tradier exposes these as first-class primitives; Alpaca is improving fast but is not yet at parity. **[needs confirm at signing]**
2. **Right-sized compliance posture.** BYO-account keeps us a SaaS tool. We avoid the BD-style supervisory overhead that Alpaca's Broker API would require, while still delivering a Robinhood-style UX over the customer's own account.
3. **Predictable economics.** $10/mo Pro is paid by the customer to Tradier; we monetize via our own SaaS pricing. No revenue depends on negotiating a PFOF split.
4. **Faster path to production.** Tradier's developer-first onboarding means we can ship to paying users in weeks; Alpaca's Broker API path is months.

**Revisit Alpaca if any of these become true:**
- Product strategy shifts to "open the account inside our app, never leave for a broker UI" (then Broker API wins).
- We want material non-subscription revenue from PFOF / margin / stock loan rev-share.
- Alpaca's options multi-leg coverage reaches parity with Tradier *and* their options pricing becomes meaningfully cheaper for our customers.

---

## Appendix A — Questions to ask each partnerships team

Send these before signing anything. Each question is phrased to be answerable with a number, a yes/no, or a contract clause reference.

### To Tradier
1. **Pricing / referral.** Do you offer any private referral commission, SaaS-discount program, or revenue-share for ISVs whose users open Tradier accounts through us? If so, what's the structure and minimum volume to qualify?
2. **Pro-plan economics.** If our customer base subscribes to Pro through us, is there a bundled or co-marketed pricing tier?
3. **Multi-leg orders.** Confirm full support for: vertical spreads, iron condors, calendars, diagonals, jade lizards, and **roll-as-single-order** (close one short option + open another as one ticket). Any leg-count or strategy-list cap?
4. **Assignment & exercise events.** What is the typical latency from broker-side assignment to event arriving on our WebSocket stream? Any documented SLA?
5. **Order preview endpoint.** Is the `/preview` endpoint available for all options strategies we'd send? Does it return buying-power impact, max loss, and margin requirement?
6. **Production OAuth review.** What are the criteria, expected timeline, and most common rejection reasons? Is there an expedited path for vetted partners?
7. **Rate limits.** Production rate limits per endpoint and per account, and the procedure to raise them?
8. **Data licensing.** OPRA options data fees — pass-through to the customer or covered by Pro? Real-time quotes for retail vs. pro classification — who decides?
9. **Compliance responsibilities.** What disclosures / audit logs / order-handling policies are *we* required to maintain as a third-party app under FINRA?
10. **Exclusivity / non-compete.** Any clauses preventing us from also offering an Alpaca (or other) integration in the same app?
11. **White-label.** Can the OAuth login screen be co-branded? Any partner-branded onboarding flows available?
12. **Support SLA.** Response-time commitment for production incidents at our expected scale (e.g., 5,000 active accounts)?
13. **Geography.** Beyond US accounts, are international users supported, and through which entity?
14. **Termination & data portability.** If we wind down the integration, what happens to customer accounts and how is order history exported?

### To Alpaca
1. **Trading API vs. Broker API for our use case.** Given a SaaS dashboard whose users want to keep their own brokerage account, is the Trading API the right surface, or is there a partner-tier of the Trading API we should be on?
2. **Options coverage today.** Confirm current support for: cash-secured puts, covered calls, vertical spreads, iron condors, calendars, **roll-as-single-order**. List anything not yet supported and timeline.
3. **Per-contract pricing.** Current per-contract options commission for Trading API customers, and any partner-discounted rate.
4. **Rev-share — if Broker API.** Specific splits on: PFOF (equities and options separately), margin interest, fully-paid securities lending, cash sweep / float. Any minimum AUM or volume thresholds to unlock each.
5. **PFOF on options.** Does Alpaca currently take PFOF on options orders for Broker API partners? If so, what % is shared with the partner?
6. **Onboarding timeline.** Realistic time-to-production for Broker API: contract signing → integration certification → first live customer.
7. **Compliance / supervisory burden.** What WSPs (written supervisory procedures), trade-surveillance, customer-complaint handling, and books-and-records duties fall on us as a Broker API partner?
8. **Multi-leg order ticket.** Single API call for a multi-leg options order today, or do we have to leg in? If single-call, what's the strategy whitelist?
9. **Order preview / buying-power.** Is there a preview endpoint comparable to Tradier's that returns BP impact and max loss for an arbitrary multi-leg ticket?
10. **Real-time event stream for assignments.** How and when are assignment / exercise / expiration events delivered? Latency commitment?
11. **Data fees.** SIP and OPRA fees for our user population — pass-through or partner-bundled?
12. **Exclusivity.** Any exclusivity, non-compete, or "most-favored-nation" clauses in the standard partner agreement?
13. **White-label / co-brand.** Trading API model: can we hide or co-brand the Alpaca account-linking screens? Broker API model: are there any required Alpaca-branded surfaces?
14. **Minimums.** Minimum monthly active accounts, AUM, or trade volume to retain partner pricing or rev-share tier.
15. **Termination & customer-account portability.** If we switch brokers later, can customer accounts and history be migrated cleanly?

---

## Appendix B — Source notes

All **[public]** references should be re-verified the week of contracting; brokerage pricing and policy changes frequently.

- Tradier pricing: https://tradier.com/pricing **[public]**
- Tradier API docs: https://documentation.tradier.com **[public]**
- Tradier 606 / order-routing disclosure: https://tradier.com/disclosures **[public]**
- Alpaca pricing: https://alpaca.markets/pricing **[public]**
- Alpaca options docs: https://docs.alpaca.markets/docs/options-trading **[public]**
- Alpaca Broker API: https://alpaca.markets/broker **[public]**
- Alpaca trading docs: https://docs.alpaca.markets **[public]**

Anything not on this list and not tagged **[public]** in the body above should be treated as **[needs confirm]** before being relied on for a contracting decision.
# Brokerage Partnership Evaluation: Tradier vs. Alpaca

**Audience:** Decision-maker choosing a brokerage partner for the Wheel Strategy Dashboard before any live-trade-execution work begins.
**Status:** Research only — no integration code is written. All claims below are tagged either **[public]** with a link, or **[needs confirm]** meaning a partnerships call is required to verify.
**Last reviewed:** 2026-05-14

---

## TL;DR Recommendation

**Recommended partner: Tradier.**

For a *wheel-strategy options* product whose users already have (or are willing to open) a brokerage account and want a Robinhood-style options trading UX, **Tradier Brokerage** is the better fit today because:

1. Options trading is a first-class, mature product on Tradier's API — multi-leg orders, full options chains with greeks, and per-contract pricing are all natively exposed. Alpaca's options API is newer and still maturing (Level 1–3 rolled out 2024; spreads/multi-leg coverage is narrower). **[needs confirm — verify current Alpaca multi-leg support at time of contracting]**
2. Tradier has a long-standing **"developer-first / BYO-account" model** with published flat-rate pricing ($10/mo unlimited equity + $0.35/contract on the Pro plan), which lets the dashboard offer a Robinhood-style UX *on top of* a customer's own Tradier account without us becoming an introducing broker. **[public — tradier.com/pricing]**
3. Alpaca is the better choice **only if** the long-term plan is to become a fully embedded broker-dealer-style product (Alpaca Broker API offers white-labeled, fully-disclosed accounts and revenue-share on PFOF, margin, and stock loan). That path requires far more compliance work and is overkill for a wheel-strategy dashboard at this stage. **[public — alpaca.markets/broker]**

If the product strategy ever pivots to "open an account inside our app, never leave," revisit this — Alpaca's Broker API wins that scenario.

---

## Side-by-side comparison

| Dimension | Tradier | Alpaca |
|---|---|---|
| Primary product for us | **Tradier Brokerage API** (BYO-account) | **Trading API** (BYO-account) or **Broker API** (embedded/white-label) |
| Options trading maturity | Mature; multi-leg, chains, greeks since launch **[public — documentation.tradier.com]** | Options launched 2024; Level 1–3 access; multi-leg support expanding **[public — docs.alpaca.markets/docs/options-trading]** **[needs confirm — current spread/4-leg coverage]** |
| Equities | Yes | Yes, plus fractional shares **[public — alpaca.markets]** |
| Crypto | No | Yes (separate API) **[public]** |
| Paper / sandbox | Yes — sandbox.tradier.com, free, full options simulation **[public]** | Yes — paper.alpaca.markets, free, generous **[public]** |
| Pricing to end user (BYO-account model) | $0 stock; $0.35/contract options; **$10/mo Pro removes per-trade equity commission and lowers other fees** **[public — tradier.com/pricing]** | $0 stock & ETF commissions; $0.50–$0.65/contract options for retail self-directed accounts **[public — alpaca.markets/pricing]** **[needs confirm — current options rate]** |
| Pricing to *us* (the developer) | Free API access at sandbox; production API tied to customer's brokerage account, no per-call fees **[public]** | Free Trading API; **Broker API has volume-based pricing and partnership terms** **[needs confirm]** |
| Rev-share to partners | **No public rev-share program for the BYO-account API.** Partners earn via subscription / their own SaaS pricing. **[needs confirm — any private referral or SaaS-discount program]** | **Broker API revenue-share** on PFOF, margin interest, stock loan, and fees; details only on partnership call **[public that program exists, terms needs confirm — alpaca.markets/broker]** |
| Partner support | Email + community Slack; partner engineering available for Pro accounts **[needs confirm — SLAs, dedicated rep tiers]** | Dedicated solutions engineer for Broker API customers; community Slack for Trading API **[needs confirm]** |
| Onboarding to integrate | Self-serve developer signup, OAuth app registration; production access requires app review **[public]** | Self-serve for Trading API; **Broker API requires sales call, KYC of the partner entity, BD/compliance review** **[public]** |
| White-label / embedded accounts | Limited — Tradier supports OAuth-based account linking; not a full white-label BD platform **[needs confirm]** | Yes — Broker API offers fully-disclosed and omnibus models, Alpaca acts as the carrying broker **[public]** |
| PFOF treatment | Tradier discloses PFOF on its 606 reports; partners do not share **[public — Tradier 606]** | Alpaca does not take PFOF on equities (per its public stance); options PFOF model exists for Broker API partners **[needs confirm — current options PFOF policy & rev-share %]** |
| Compliance burden on us | **Low** — customer holds the brokerage relationship. We are a SaaS tool. | **Low (Trading API)** / **High (Broker API — we'd need a written supervisory agreement, vendor due diligence, possibly RIA/IA registration)** **[needs confirm]** |
| Order-status push | WebSocket streaming for orders + market data **[public]** | WebSocket streaming for orders + market data **[public]** |
| Real-time market data | Included; OPRA options data add-on for non-pro users **[public]** | IEX free; SIP / OPRA paid tiers **[public]** |
| Min volume commitments | None known for API tier **[needs confirm]** | None for Trading API; **Broker API likely has minimums** **[needs confirm]** |
| Exclusivity clauses | None known **[needs confirm]** | **[needs confirm]** |
| Geography | US accounts; some intl support **[needs confirm]** | US + international (LATAM, EU via Alpaca entities) **[public]** |

---

## Tradier — detail

### Product offering
Tradier operates as a US broker-dealer (member FINRA/SIPC) that exposes its brokerage rails through a REST + streaming API. Two relevant products:
- **Tradier Brokerage API** — customer opens a Tradier account, our app authenticates via OAuth and places orders / reads positions on their behalf. **[public]**
- **Tradier Market Data API** — quotes, chains, historicals; can be used standalone. **[public]**

### Options trading capabilities
- Full options chains with greeks, IV, OI, volume **[public]**
- Single-leg and multi-leg orders (verticals, condors, calendars, straddles) — **directly relevant to wheel rolls** **[public]**
- Equity options + index options **[public]**
- Per-contract commission $0.35 (Pro plan); $0 on the per-trade equity side **[public]**

### Partnership program structure
Tradier's "partnership" is more accurately a **developer/ISV program**: the customer is Tradier's brokerage customer, and we are an authorized third-party app. There is no embedded-broker offering. **[public for the model; needs confirm for any formal "partner" tier with co-marketing or rev-share]**

### Revenue-share model
No public rev-share. Our monetization is our own SaaS subscription. Tradier's $10/mo Pro plan is paid by the customer, not split with us. **[needs confirm — whether a referral kickback exists privately]**

### Partner support
Documentation portal, developer Slack, and email support. Higher-tier partners reportedly get a named contact. **[needs confirm]**

### Onboarding / approval process
1. Create a developer account (free, instant)
2. Build against sandbox
3. Submit production OAuth app for review (security + UX checks)
4. Customers connect via OAuth on their own Tradier accounts
**[public — documentation.tradier.com]**

### Sandbox / paper trading
`sandbox.tradier.com` — free, simulated fills, full options chain, no real money. Quality is generally good for development. **[public]**

### Known limitations
- US accounts only (mostly) **[needs confirm]**
- Not a white-label / embedded-account platform — customer must explicitly hold a Tradier account
- Smaller brand recognition than larger brokers — some users may need education
- Options assignment / exercise notifications come through the standard order events stream; latency is acceptable but not "instant" **[needs confirm]**

---

## Alpaca — detail

### Product offering
Alpaca offers two distinct products. Choosing the wrong one is the most common mistake in this evaluation:
- **Trading API** — analogous to Tradier's BYO-account model. Customer opens an Alpaca account, our app trades on their behalf via OAuth. **[public]**
- **Broker API** — Alpaca acts as the *carrying* broker for accounts our app *originates*. We become the user-facing brand; Alpaca handles clearing, custody, and regulatory plumbing. This is what powers many "neobroker" apps. **[public — alpaca.markets/broker]**

### Options trading capabilities
- Options launched in 2024 with Level 1 and 2; Level 3 (spreads) rolled out subsequently **[public — docs.alpaca.markets/docs/options-trading]**
- Multi-leg support exists but the catalog of supported strategies is narrower than Tradier's; **confirm 4-leg / iron condor / calendar support at time of contracting** **[needs confirm]**
- Greeks/chains available
- Per-contract commission $0.50–$0.65 retail; partner pricing on Broker API **[needs confirm — current rate]**

### Partnership program structure
- Trading API: self-serve, no formal partnership
- **Broker API: a real partnership program** with sales engagement, BD-style due diligence on the partner, and a tiered relationship. This is where rev-share lives. **[public]**

### Revenue-share model (Broker API only)
Alpaca shares revenue with Broker API partners on:
- Order flow (PFOF, where applicable) **[needs confirm — exact splits and which asset classes]**
- Margin interest spread **[needs confirm]**
- Stock loan / fully-paid securities lending **[needs confirm]**
- Float / cash sweep **[needs confirm]**
Specific percentages are not published and are negotiated per partner. **[needs confirm]**

### Partner support
Trading API: docs + community Slack. Broker API: dedicated solutions engineer + compliance contact during onboarding. **[needs confirm — ongoing SLA after launch]**

### Onboarding / approval process
- Trading API: self-serve, days **[public]**
- Broker API: weeks-to-months — entity KYC, written supervisory procedures review, contract negotiation, integration certification **[public]**

### Sandbox / paper trading
`paper.alpaca.markets` — free, well-regarded; supports both APIs. **[public]**

### Known limitations
- Options API maturity vs. Tradier (catching up but not at parity for advanced multi-leg) **[needs confirm]**
- Broker API pulls us into a much heavier compliance posture; not justified at our current stage
- Documentation for advanced options scenarios (assignment notifications, expiration handling) is thinner than Tradier's **[needs confirm]**

---

## Robinhood-style UX fit

The Robinhood trading experience boils down to a small set of core flows. Below is how each broker's API supports them for *our* use case (a wheel-strategy dashboard where users see candidates, then act).

| Robinhood-style flow | Tradier | Alpaca |
|---|---|---|
| **One-tap buy/sell (equities)** — single REST call, optimistic UI, status push | ✅ Native: `POST /v1/accounts/{id}/orders` + WebSocket order stream **[public]** | ✅ Native: `POST /v2/orders` + WebSocket **[public]** |
| **Options chain browsing with quick-select strikes** — single endpoint returning a full chain with greeks, IV, OI, sorted by strike/expiry | ✅ `GET /v1/markets/options/chains` returns full chain with greeks in one call **[public]** | ⚠️ Available, but greeks/IV require the options snapshot endpoint and the response shape requires more client-side assembly **[needs confirm — current shape]** |
| **Single-screen order ticket (preview → confirm)** | ✅ `POST .../orders/preview` for cost/buying-power preview, then submit **[public]** | ⚠️ No first-class "preview" endpoint for options at parity with Tradier; we'd compute cost client-side **[needs confirm]** |
| **Instant order status (push)** | ✅ WebSocket order events **[public]** | ✅ WebSocket order events **[public]** |
| **Position cards with real-time P/L** | ✅ Positions endpoint + streaming quotes; cost basis included **[public]** | ✅ Positions endpoint + streaming quotes **[public]** |
| **Multi-leg order ticket (wheel rolls — close short put + open new short put as one order)** | ✅ Native multi-leg orders accepted as a single ticket **[public]** | ⚠️ Supported for the strategies Alpaca currently lists; **confirm coverage of roll-as-single-order** **[needs confirm]** |
| **Recurring / scheduled actions (e.g., "sell a put every Friday")** | ❌ Not native — we'd schedule server-side and submit on the day **[public]** | ❌ Not native (recurring investments exist for equities on Broker API consumer apps but not for options) **[needs confirm]** |
| **Fractional shares (relevant if we ever add equity wheels for high-priced names)** | ❌ Not supported **[public]** | ✅ Supported on Trading & Broker APIs **[public]** |
| **Instant funding / ACH visualization** | ⚠️ ACH transfers via API, but "instant deposit" is a Robinhood proprietary product — Tradier shows pending until cleared **[public]** | ⚠️ Same: ACH visible via API; "instant" is not a thing unless we front it ourselves on Broker API **[needs confirm]** |
| **In-app account opening (if we ever want it)** | ❌ Not in scope for Tradier's API **[public]** | ✅ Broker API only **[public]** |
| **Push notifications on assignment / expiration** | ⚠️ Surfaced via order events stream; we transform and notify **[public]** | ⚠️ Same pattern **[needs confirm — assignment event timing]** |

### What this means for our product
- For the **wheel-specific flows** (browse cash-secured-put candidates → preview → submit → watch fill → see position card → roll as single multi-leg ticket), **Tradier supports every flow natively today**. Alpaca supports most but with more client-side glue and some open questions around multi-leg roll tickets.
- The two flows we cannot get *natively* from either broker — recurring/scheduled options orders, and "instant" deposits — are scheduler features we'd build ourselves regardless of broker.
- Fractional shares are an Alpaca-only win, but they are **irrelevant to a wheel-strategy options product** (options trade in 100-share contract units).
- In-app account opening is an Alpaca-Broker-API-only capability and is **out of scope** for the current product strategy.

---

## Recommendation (expanded)

**Use Tradier Brokerage API** as the broker partner for live execution.

Reasons, ranked:
1. **Options-first API maturity.** A wheel dashboard lives or dies on options ergonomics — chains, greeks, multi-leg rolls, assignments. Tradier exposes these as first-class primitives; Alpaca is improving fast but is not yet at parity. **[needs confirm at signing]**
2. **Right-sized compliance posture.** BYO-account keeps us a SaaS tool. We avoid the BD-style supervisory overhead that Alpaca's Broker API would require, while still delivering a Robinhood-style UX over the customer's own account.
3. **Predictable economics.** $10/mo Pro is paid by the customer to Tradier; we monetize via our own SaaS pricing. No revenue depends on negotiating a PFOF split.
4. **Faster path to production.** Tradier's developer-first onboarding means we can ship to paying users in weeks; Alpaca's Broker API path is months.

**Revisit Alpaca if any of these become true:**
- Product strategy shifts to "open the account inside our app, never leave for a broker UI" (then Broker API wins).
- We want material non-subscription revenue from PFOF / margin / stock loan rev-share.
- Alpaca's options multi-leg coverage reaches parity with Tradier *and* their options pricing becomes meaningfully cheaper for our customers.

---

## Appendix A — Questions to ask each partnerships team

Send these before signing anything. Each question is phrased to be answerable with a number, a yes/no, or a contract clause reference.

### To Tradier
1. **Pricing / referral.** Do you offer any private referral commission, SaaS-discount program, or revenue-share for ISVs whose users open Tradier accounts through us? If so, what's the structure and minimum volume to qualify?
2. **Pro-plan economics.** If our customer base subscribes to Pro through us, is there a bundled or co-marketed pricing tier?
3. **Multi-leg orders.** Confirm full support for: vertical spreads, iron condors, calendars, diagonals, jade lizards, and **roll-as-single-order** (close one short option + open another as one ticket). Any leg-count or strategy-list cap?
4. **Assignment & exercise events.** What is the typical latency from broker-side assignment to event arriving on our WebSocket stream? Any documented SLA?
5. **Order preview endpoint.** Is the `/preview` endpoint available for all options strategies we'd send? Does it return buying-power impact, max loss, and margin requirement?
6. **Production OAuth review.** What are the criteria, expected timeline, and most common rejection reasons? Is there an expedited path for vetted partners?
7. **Rate limits.** Production rate limits per endpoint and per account, and the procedure to raise them?
8. **Data licensing.** OPRA options data fees — pass-through to the customer or covered by Pro? Real-time quotes for retail vs. pro classification — who decides?
9. **Compliance responsibilities.** What disclosures / audit logs / order-handling policies are *we* required to maintain as a third-party app under FINRA?
10. **Exclusivity / non-compete.** Any clauses preventing us from also offering an Alpaca (or other) integration in the same app?
11. **White-label.** Can the OAuth login screen be co-branded? Any partner-branded onboarding flows available?
12. **Support SLA.** Response-time commitment for production incidents at our expected scale (e.g., 5,000 active accounts)?
13. **Geography.** Beyond US accounts, are international users supported, and through which entity?
14. **Termination & data portability.** If we wind down the integration, what happens to customer accounts and how is order history exported?

### To Alpaca
1. **Trading API vs. Broker API for our use case.** Given a SaaS dashboard whose users want to keep their own brokerage account, is the Trading API the right surface, or is there a partner-tier of the Trading API we should be on?
2. **Options coverage today.** Confirm current support for: cash-secured puts, covered calls, vertical spreads, iron condors, calendars, **roll-as-single-order**. List anything not yet supported and timeline.
3. **Per-contract pricing.** Current per-contract options commission for Trading API customers, and any partner-discounted rate.
4. **Rev-share — if Broker API.** Specific splits on: PFOF (equities and options separately), margin interest, fully-paid securities lending, cash sweep / float. Any minimum AUM or volume thresholds to unlock each.
5. **PFOF on options.** Does Alpaca currently take PFOF on options orders for Broker API partners? If so, what % is shared with the partner?
6. **Onboarding timeline.** Realistic time-to-production for Broker API: contract signing → integration certification → first live customer.
7. **Compliance / supervisory burden.** What WSPs (written supervisory procedures), trade-surveillance, customer-complaint handling, and books-and-records duties fall on us as a Broker API partner?
8. **Multi-leg order ticket.** Single API call for a multi-leg options order today, or do we have to leg in? If single-call, what's the strategy whitelist?
9. **Order preview / buying-power.** Is there a preview endpoint comparable to Tradier's that returns BP impact and max loss for an arbitrary multi-leg ticket?
10. **Real-time event stream for assignments.** How and when are assignment / exercise / expiration events delivered? Latency commitment?
11. **Data fees.** SIP and OPRA fees for our user population — pass-through or partner-bundled?
12. **Exclusivity.** Any exclusivity, non-compete, or "most-favored-nation" clauses in the standard partner agreement?
13. **White-label / co-brand.** Trading API model: can we hide or co-brand the Alpaca account-linking screens? Broker API model: are there any required Alpaca-branded surfaces?
14. **Minimums.** Minimum monthly active accounts, AUM, or trade volume to retain partner pricing or rev-share tier.
15. **Termination & customer-account portability.** If we switch brokers later, can customer accounts and history be migrated cleanly?

---

## Appendix B — Source notes

All **[public]** references should be re-verified the week of contracting; brokerage pricing and policy changes frequently.

- Tradier pricing: https://tradier.com/pricing **[public]**
- Tradier API docs: https://documentation.tradier.com **[public]**
- Tradier 606 / order-routing disclosure: https://tradier.com/disclosures **[public]**
- Alpaca pricing: https://alpaca.markets/pricing **[public]**
- Alpaca options docs: https://docs.alpaca.markets/docs/options-trading **[public]**
- Alpaca Broker API: https://alpaca.markets/broker **[public]**
- Alpaca trading docs: https://docs.alpaca.markets **[public]**

Anything not on this list and not tagged **[public]** in the body above should be treated as **[needs confirm]** before being relied on for a contracting decision.
