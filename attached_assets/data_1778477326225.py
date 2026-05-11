"""
Market data layer.

Currently uses yfinance because it's free and requires no API key.
The MarketData class is intentionally small so it can be swapped for
Alpaca, Tradier, or Schwab later without touching the screener logic.
"""

from __future__ import annotations

import os
import time
import json
import pickle
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
import yfinance as yf


@dataclass
class OptionChainSnapshot:
    ticker: str
    spot: float
    expiry: str          # YYYY-MM-DD
    dte: int             # whole days
    puts: pd.DataFrame   # columns from yfinance: strike, bid, ask, lastPrice, impliedVolatility, openInterest, volume, ...
    calls: pd.DataFrame


class MarketData:
    def __init__(self, cache_dir: str = ".cache", cache_ttl_minutes: int = 15):
        self.cache_dir = cache_dir
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)
        os.makedirs(cache_dir, exist_ok=True)

    # ----- cache helpers -----------------------------------------------------

    def _cache_path(self, key: str) -> str:
        safe = key.replace("/", "_").replace(":", "_")
        return os.path.join(self.cache_dir, f"{safe}.pkl")

    def _load_cache(self, key: str):
        path = self._cache_path(key)
        if not os.path.exists(path):
            return None
        age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(path))
        if age > self.cache_ttl:
            return None
        try:
            with open(path, "rb") as f:
                return pickle.load(f)
        except Exception:
            return None

    def _save_cache(self, key: str, value) -> None:
        try:
            with open(self._cache_path(key), "wb") as f:
                pickle.dump(value, f)
        except Exception:
            pass

    # ----- public API --------------------------------------------------------

    def get_spot(self, ticker: str) -> Optional[float]:
        cache_key = f"spot_{ticker}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="5d", interval="1d", auto_adjust=False)
            if hist.empty:
                return None
            spot = float(hist["Close"].iloc[-1])
            self._save_cache(cache_key, spot)
            return spot
        except Exception as e:
            print(f"  ! failed to fetch spot for {ticker}: {e}")
            return None

    def get_expirations(self, ticker: str) -> List[str]:
        cache_key = f"exp_{ticker}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached
        try:
            exps = list(yf.Ticker(ticker).options or [])
            self._save_cache(cache_key, exps)
            return exps
        except Exception as e:
            print(f"  ! failed to fetch expirations for {ticker}: {e}")
            return []

    def get_option_chain(self, ticker: str, expiry: str) -> Optional[OptionChainSnapshot]:
        cache_key = f"chain_{ticker}_{expiry}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached
        try:
            t = yf.Ticker(ticker)
            chain = t.option_chain(expiry)
            spot = self.get_spot(ticker)
            if spot is None:
                return None
            today = datetime.now().date()
            exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            snap = OptionChainSnapshot(
                ticker=ticker,
                spot=spot,
                expiry=expiry,
                dte=dte,
                puts=chain.puts.copy(),
                calls=chain.calls.copy(),
            )
            self._save_cache(cache_key, snap)
            return snap
        except Exception as e:
            print(f"  ! failed to fetch chain for {ticker} {expiry}: {e}")
            return None

    def get_iv_history_proxy(self, ticker: str, lookback_days: int = 252) -> Optional[pd.Series]:
        """
        Approximate IV history using realized (historical) volatility from
        daily returns. True IV history requires a paid feed; HV is a
        reasonable stand-in for computing a "rank" until you upgrade.
        """
        cache_key = f"hv_{ticker}_{lookback_days}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="2y", interval="1d", auto_adjust=False)
            if hist.empty:
                return None
            returns = hist["Close"].pct_change().dropna()
            # 30-day rolling annualized realized vol.
            hv = returns.rolling(30).std() * (252 ** 0.5)
            hv = hv.dropna().tail(lookback_days)
            self._save_cache(cache_key, hv)
            return hv
        except Exception as e:
            print(f"  ! failed to fetch HV for {ticker}: {e}")
            return None
