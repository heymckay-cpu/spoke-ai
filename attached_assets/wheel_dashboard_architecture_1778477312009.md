# Wheel Strategy Dashboard — Architecture Sketch

A pragmatic blueprint for a personal wheel-strategy dashboard you can build in stages: start with a local Python screener, layer on a web UI, then upgrade data and add execution when you're ready.

## Goals

- **Find candidates.** Identify stocks suitable for the wheel and rank their short puts (and covered calls) by income vs. assignment risk.
- **Track open positions.** Show your live wheel cycles: sold puts (awaiting expiry/assignment) and covered calls against shares you own.
- **Support decisions.** Surface IV rank, delta, breakeven, annualized return, days to expiry, earnings dates, and "would I be okay owning this at the strike?" context.
- **Stay extensible.** Begin with delayed data + paper trading; later swap in real-time data and live execution without rewriting the world.

## Stages

The dashboard is easier to think about in three stages. Don't try to build all three at once.

### Stage 1 — Local screener (no UI)
Pure Python script that pulls option chains and prints a ranked table of wheel candidates. This is the foundation; everything else feeds off the same screening logic.

### Stage 2 — Web dashboard
A small web app (FastAPI + a simple React or HTMX front end, or just Streamlit if you want it fast) that runs the screener on demand, shows charts, and tracks your simulated/paper positions.

### Stage 3 — Live data + execution
Replace yfinance with a broker API (Alpaca, Tradier, or Schwab) for real-time quotes, account positions, and eventually order placement. Keep paper trading as a toggle.

## Components

```
                       ┌──────────────────────────┐
                       │   Scheduler / cron       │
                       │   (refresh every N min)  │
                       └────────────┬─────────────┘
                                    │
        ┌───────────────────────────┴──────────────────────────┐
        │                                                      │
        ▼                                                      ▼
┌──────────────────┐                                  ┌──────────────────┐
│  Market data     │                                  │  Account data    │
│  adapter         │                                  │  adapter         │
│  (yfinance /     │                                  │  (Alpaca paper / │
│   Tradier /      │                                  │   Tradier live)  │
│   Alpaca)        │                                  │                  │
└────────┬─────────┘                                  └────────┬─────────┘
         │ option chains, quotes, IV history                   │ positions, cash, P&L
         ▼                                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                          Storage layer                             │
│   SQLite (positions, watchlist, snapshots, IV-history rollup)      │
│   + flat CSV cache for raw chain pulls (cheap, debuggable)         │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │   Strategy engine          │
                │   - IV rank calc           │
                │   - Delta estimation       │
                │   - Annualized yield       │
                │   - Wheel-state machine    │
                │   - Filters / scoring      │
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │   API layer (FastAPI)      │
                │   /candidates  /positions  │
                │   /chain/{tkr} /backtest   │
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │   Front end                │
                │   - Candidates table       │
                │   - Position tracker       │
                │   - IV/HV charts           │
                │   - Wheel-cycle timeline   │
                └────────────────────────────┘
```

## Data sources by stage

| Need | Stage 1 (free, easy) | Stage 2 (free, more reliable) | Stage 3 (live) |
| --- | --- | --- | --- |
| Stock quotes | yfinance | Alpaca free tier (IEX) | Alpaca SIP / Tradier / Schwab |
| Options chains + greeks | yfinance (chain + IV; delta approximated) | Tradier sandbox (free, greeks included) | Tradier live / Schwab |
| IV history (for IV rank) | Roll your own from daily yfinance pulls | Same, with longer history | Polygon options, ThetaData |
| Earnings dates | yfinance | Finnhub free tier | Same |
| Account positions | n/a (CSV or SQLite manual) | Alpaca paper account | Real brokerage API |
| Order execution | n/a | Alpaca paper | Alpaca / Tradier / Schwab live |

## Screening logic (the part that matters)

For each ticker on your watchlist, the engine should:

1. **Filter the universe.** Drop tickers under your minimum price, low average volume, no liquid options, or with earnings inside your target DTE window (unless you specifically want the IV pop).
2. **Compute IV rank.** `(current_IV - 1yr_low_IV) / (1yr_high_IV - 1yr_low_IV)`. Wheel sellers generally want IV rank > 30 — higher premium for the risk you're taking.
3. **Pull the put chain** for expirations between 30 and 45 DTE.
4. **Estimate delta** for each strike. If your data source doesn't provide it (yfinance doesn't), use the Black–Scholes formula with the option's implied volatility — close enough for screening.
5. **Pick the target strike.** Closest strike to a target delta (commonly 0.20–0.30 for wheels). This is the "would-be-assigned-here" strike.
6. **Score the trade.**
   - Premium / collateral = static return.
   - Annualized = static return × (365 / DTE).
   - Breakeven = strike − premium.
   - Distance to strike as a % of current price.
7. **Rank and display.** Sort by annualized yield (or a custom score), but show all the columns so you can sanity-check.

Same logic applies to the covered-call side once you own shares: target ~0.20 delta calls 30–45 DTE above your cost basis, sorted by annualized yield.

## Wheel state machine

Each position is in one of these states. The engine should track and display them.

```
   ┌─────────────────┐    sell put     ┌──────────────────────┐
   │   CASH / IDLE   │ ───────────────▶│ SHORT PUT (open)     │
   └─────────────────┘                 └──────────┬───────────┘
            ▲                                     │
            │                                     │ expires worthless
            │ called away                         ▼
   ┌────────┴────────┐    sell call    ┌──────────────────────┐
   │ LONG STOCK +    │◀──── assigned ──│   CASH / IDLE        │
   │ SHORT CALL      │                 └──────────────────────┘
   └─────────────────┘
```

A row in your `positions` table is enough: `ticker, state, qty, strike, expiry, premium_collected, opened_at, cost_basis`. P&L per cycle is the sum of premiums collected plus any capital gain when called away, minus losses if you exit early or take assignment in a downdraft.

## Storage schema (SQLite, Stage 1–2)

```sql
CREATE TABLE watchlist (
    ticker      TEXT PRIMARY KEY,
    notes       TEXT
);

CREATE TABLE iv_history (
    ticker      TEXT,
    snapshot_at TEXT,        -- ISO date
    iv30        REAL,        -- 30-day ATM IV
    PRIMARY KEY (ticker, snapshot_at)
);

CREATE TABLE positions (
    id              INTEGER PRIMARY KEY,
    ticker          TEXT,
    state           TEXT,    -- idle | short_put | covered_call
    qty             INTEGER,
    strike          REAL,
    expiry          TEXT,
    premium         REAL,
    opened_at       TEXT,
    closed_at       TEXT,
    pnl             REAL
);

CREATE TABLE candidate_snapshots (
    snapshot_at     TEXT,
    ticker          TEXT,
    expiry          TEXT,
    strike          REAL,
    bid             REAL,
    iv              REAL,
    delta           REAL,
    annualized      REAL,
    iv_rank         REAL
);
```

## Refresh cadence

- **Quotes / chains:** every 5–15 minutes during market hours (free APIs are delayed anyway).
- **IV history snapshot:** once per day at market close.
- **Positions / P&L:** every minute during market hours if a broker is connected; otherwise on demand.
- **Earnings calendar:** weekly.

A simple cron or APScheduler job inside the FastAPI process is fine — no need for Celery or Redis until you outgrow it.

## Front-end views

Three screens cover 90% of the value:

1. **Candidates.** Sortable table of put-sell ideas: ticker, IV rank, target strike, delta, premium, annualized %, DTE, earnings flag.
2. **Positions.** Each open wheel cycle as a card: state, days remaining, premium collected to date, current P&L, next decision point.
3. **Detail / chain explorer.** Pick a ticker, see the put and call chains with greeks, IV/HV chart, recent earnings, and "what-if" calculator for any strike/expiry combo.

## Risk and reality checks to bake in

- **Earnings flag.** Auto-flag any candidate with earnings inside the DTE window.
- **Assignment cost reminder.** Show "cash required if assigned" = strike × 100 × contracts.
- **Concentration limits.** Warn if a single ticker would exceed N% of paper portfolio.
- **Premium-to-loss reality.** Show what a 10% / 20% drop in the underlying does to the trade — wheel income looks great until it doesn't.

## Extension path

Once Stage 1 is solid, the natural progression is:
1. Wrap the screener in FastAPI; add a Streamlit or React UI.
2. Add Alpaca paper account integration for positions tracking.
3. Migrate options data from yfinance to Tradier sandbox (real greeks).
4. Add a simple backtester that walks the wheel through historical chains.
5. Add live execution behind a "confirm before placing" guardrail.

Keep adapters behind small interfaces (`MarketDataProvider`, `BrokerProvider`) so swapping providers is a config change, not a rewrite.
