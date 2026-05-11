"""
Configuration for the wheel screener.

Tweak these values to match your style. Defaults reflect common
"conservative wheel" parameters: 30–45 DTE, ~0.25 delta puts,
on liquid mid/large-cap names.
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class ScreenerConfig:
    # Watchlist of tickers to evaluate. Pick stocks you would actually
    # be okay owning at a 10–20% discount.
    tickers: List[str] = field(default_factory=lambda: [
        "AAPL", "MSFT", "GOOGL", "AMZN", "META",
        "NVDA", "AMD", "INTC", "TSLA",
        "JPM", "BAC", "WFC",
        "KO", "PEP", "WMT", "COST",
        "F", "GM",
        "XOM", "CVX",
        "PFE", "JNJ", "MRK",
        "DIS", "NFLX",
        "T", "VZ",
        "SOFI", "PLTR", "SNAP",
    ])

    # Days-to-expiration window we want to sell into.
    min_dte: int = 25
    max_dte: int = 50

    # Target delta band for short puts. We pick the strike whose
    # estimated delta is closest to `target_delta` and inside the band.
    target_delta: float = 0.25
    min_delta: float = 0.15
    max_delta: float = 0.35

    # Liquidity floors so we don't get stuck in dead chains.
    min_open_interest: int = 100
    min_bid: float = 0.10
    min_underlying_price: float = 5.0

    # Risk-free rate for Black–Scholes delta estimation.
    # Approximate; doesn't need to be perfect for screening.
    risk_free_rate: float = 0.045

    # Show top N rows in the output table.
    top_n: int = 20

    # Cache option chain fetches to disk so reruns are fast.
    cache_dir: str = ".cache"
    cache_ttl_minutes: int = 15
