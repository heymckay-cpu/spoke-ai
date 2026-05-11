"""
Wheel screener — finds short-put candidates suitable for the wheel.

Usage:
    python screener.py
    python screener.py --tickers AAPL MSFT NVDA
    python screener.py --target-delta 0.3 --top-n 30

Outputs a ranked table of the most attractive short-put candidates by
annualized yield, filtered by your DTE and delta preferences.
"""

from __future__ import annotations

import argparse
from datetime import datetime
from typing import List, Optional

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table

from config import ScreenerConfig
from data import MarketData, OptionChainSnapshot
from greeks import put_delta


console = Console()


def iv_rank(current_hv: float, hv_series: pd.Series) -> Optional[float]:
    """
    IV rank using historical vol as a proxy for IV history.

    Returns a number in [0, 1] where 0 = at 1yr low, 1 = at 1yr high.
    """
    if hv_series is None or hv_series.empty or not np.isfinite(current_hv):
        return None
    lo, hi = float(hv_series.min()), float(hv_series.max())
    if hi - lo < 1e-9:
        return None
    return max(0.0, min(1.0, (current_hv - lo) / (hi - lo)))


def pick_short_put(
    snap: OptionChainSnapshot,
    cfg: ScreenerConfig,
) -> Optional[dict]:
    """
    From an option chain snapshot, pick the best short-put candidate.

    Returns a dict row with the trade's stats, or None if nothing qualifies.
    """
    if snap.dte < cfg.min_dte or snap.dte > cfg.max_dte:
        return None

    puts = snap.puts.copy()
    if puts.empty:
        return None

    # Liquidity / sanity filters.
    puts = puts[puts["bid"].fillna(0) >= cfg.min_bid]
    puts = puts[puts["openInterest"].fillna(0) >= cfg.min_open_interest]
    puts = puts[puts["impliedVolatility"].fillna(0) > 0.01]
    # OTM puts only (strike below spot).
    puts = puts[puts["strike"] < snap.spot]
    if puts.empty:
        return None

    T = max(snap.dte, 1) / 365.0
    deltas = []
    for _, row in puts.iterrows():
        d = put_delta(
            S=snap.spot,
            K=float(row["strike"]),
            r=cfg.risk_free_rate,
            sigma=float(row["impliedVolatility"]),
            T_years=T,
        )
        deltas.append(d)
    puts = puts.assign(delta=deltas)
    puts = puts.dropna(subset=["delta"])
    puts = puts[(puts["delta"] >= cfg.min_delta) & (puts["delta"] <= cfg.max_delta)]
    if puts.empty:
        return None

    # Pick strike whose delta is closest to target.
    puts = puts.assign(delta_dist=(puts["delta"] - cfg.target_delta).abs())
    best = puts.sort_values("delta_dist").iloc[0]

    strike = float(best["strike"])
    bid = float(best["bid"])
    premium = bid                       # per share
    collateral = strike                  # cash-secured: 1 contract = strike * 100
    static_return = premium / collateral
    annualized = static_return * (365.0 / max(snap.dte, 1))
    breakeven = strike - premium
    pct_otm = (snap.spot - strike) / snap.spot

    return {
        "ticker": snap.ticker,
        "spot": snap.spot,
        "expiry": snap.expiry,
        "dte": snap.dte,
        "strike": strike,
        "delta": float(best["delta"]),
        "bid": bid,
        "iv": float(best["impliedVolatility"]),
        "open_interest": int(best.get("openInterest", 0) or 0),
        "premium_per_contract": premium * 100,
        "collateral_per_contract": collateral * 100,
        "static_return_pct": static_return * 100,
        "annualized_pct": annualized * 100,
        "breakeven": breakeven,
        "pct_otm": pct_otm * 100,
    }


def screen(cfg: ScreenerConfig) -> pd.DataFrame:
    md = MarketData(cache_dir=cfg.cache_dir, cache_ttl_minutes=cfg.cache_ttl_minutes)
    rows = []

    for ticker in cfg.tickers:
        console.print(f"[bold]scanning {ticker}[/bold]")
        spot = md.get_spot(ticker)
        if spot is None or spot < cfg.min_underlying_price:
            console.print(f"  - skipped (spot={spot})")
            continue

        # IV rank proxy from historical vol.
        hv_series = md.get_iv_history_proxy(ticker)
        current_hv = float(hv_series.iloc[-1]) if hv_series is not None and not hv_series.empty else float("nan")
        rank = iv_rank(current_hv, hv_series)

        expirations = md.get_expirations(ticker)
        if not expirations:
            console.print("  - no expirations found")
            continue

        today = datetime.now().date()
        best_row = None
        for exp in expirations:
            try:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            except ValueError:
                continue
            dte = (exp_date - today).days
            if dte < cfg.min_dte or dte > cfg.max_dte:
                continue
            snap = md.get_option_chain(ticker, exp)
            if snap is None:
                continue
            row = pick_short_put(snap, cfg)
            if row is None:
                continue
            row["hv30"] = current_hv
            row["iv_rank"] = rank
            if best_row is None or row["annualized_pct"] > best_row["annualized_pct"]:
                best_row = row

        if best_row is not None:
            rows.append(best_row)
            console.print(
                f"  ✓ candidate: {best_row['expiry']} "
                f"${best_row['strike']:.2f}p Δ={best_row['delta']:.2f} "
                f"annualized={best_row['annualized_pct']:.1f}%"
            )
        else:
            console.print("  - no qualifying strike in DTE/delta window")

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df = df.sort_values("annualized_pct", ascending=False).reset_index(drop=True)
    return df


def render_table(df: pd.DataFrame, top_n: int) -> None:
    if df.empty:
        console.print("\n[yellow]No candidates passed the filters.[/yellow]")
        return

    df = df.head(top_n)
    table = Table(title="Wheel candidates — short cash-secured puts", show_lines=False)
    table.add_column("Ticker", style="bold")
    table.add_column("Spot")
    table.add_column("Expiry")
    table.add_column("DTE")
    table.add_column("Strike")
    table.add_column("Δ")
    table.add_column("Bid")
    table.add_column("IV")
    table.add_column("IV rank*")
    table.add_column("Premium/ctr")
    table.add_column("Collat/ctr")
    table.add_column("Static %")
    table.add_column("Annualized %", style="green")
    table.add_column("Breakeven")
    table.add_column("% OTM")

    for _, r in df.iterrows():
        ivr = f"{r['iv_rank']*100:.0f}" if pd.notna(r.get("iv_rank")) else "—"
        table.add_row(
            r["ticker"],
            f"${r['spot']:.2f}",
            r["expiry"],
            str(r["dte"]),
            f"${r['strike']:.2f}",
            f"{r['delta']:.2f}",
            f"${r['bid']:.2f}",
            f"{r['iv']*100:.0f}%",
            ivr,
            f"${r['premium_per_contract']:.0f}",
            f"${r['collateral_per_contract']:.0f}",
            f"{r['static_return_pct']:.2f}%",
            f"{r['annualized_pct']:.1f}%",
            f"${r['breakeven']:.2f}",
            f"{r['pct_otm']:.1f}%",
        )

    console.print(table)
    console.print(
        "\n[dim]* IV rank here is approximated from historical (realized) vol,"
        " since yfinance doesn't expose true IV history. Upgrade to a paid"
        " options data feed (Polygon, ThetaData) for real IV rank.[/dim]"
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Wheel-strategy short-put screener.")
    p.add_argument("--tickers", nargs="+", help="Override the watchlist.")
    p.add_argument("--target-delta", type=float, help="Target delta for short puts.")
    p.add_argument("--min-dte", type=int, help="Minimum days to expiration.")
    p.add_argument("--max-dte", type=int, help="Maximum days to expiration.")
    p.add_argument("--top-n", type=int, help="How many rows to print.")
    p.add_argument("--csv", type=str, help="Optional path to save results as CSV.")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    cfg = ScreenerConfig()
    if args.tickers:
        cfg.tickers = [t.upper() for t in args.tickers]
    if args.target_delta is not None:
        cfg.target_delta = args.target_delta
    if args.min_dte is not None:
        cfg.min_dte = args.min_dte
    if args.max_dte is not None:
        cfg.max_dte = args.max_dte
    if args.top_n is not None:
        cfg.top_n = args.top_n

    console.rule(f"[bold]Wheel screener[/bold]  {datetime.now():%Y-%m-%d %H:%M}")
    console.print(
        f"DTE {cfg.min_dte}-{cfg.max_dte}, "
        f"target Δ {cfg.target_delta} ({cfg.min_delta}-{cfg.max_delta}), "
        f"{len(cfg.tickers)} tickers\n"
    )

    df = screen(cfg)
    console.print()
    render_table(df, cfg.top_n)

    if args.csv:
        df.to_csv(args.csv, index=False)
        console.print(f"\n[dim]wrote {args.csv}[/dim]")


if __name__ == "__main__":
    main()
