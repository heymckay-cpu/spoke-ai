"""
Black–Scholes pricing and greeks.

yfinance gives us implied vol per contract but not delta. We compute
delta ourselves from BS. For wheel screening (sorting candidates by
likelihood of assignment) this approximation is more than good enough.
"""

from __future__ import annotations

import math
from scipy.stats import norm


def _d1(S: float, K: float, r: float, sigma: float, T: float) -> float:
    return (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))


def put_delta(S: float, K: float, r: float, sigma: float, T_years: float) -> float:
    """
    Black-Scholes delta for a European put.

    Returns a positive number in [0, 1] representing |delta|, which is
    how option traders usually talk about it ("a 25-delta put").
    """
    if sigma <= 0 or T_years <= 0 or S <= 0 or K <= 0:
        return float("nan")
    d1 = _d1(S, K, r, sigma, T_years)
    # Raw put delta is N(d1) - 1, in [-1, 0]. Return absolute value.
    return abs(norm.cdf(d1) - 1.0)


def call_delta(S: float, K: float, r: float, sigma: float, T_years: float) -> float:
    """Black-Scholes delta for a European call, in [0, 1]."""
    if sigma <= 0 or T_years <= 0 or S <= 0 or K <= 0:
        return float("nan")
    d1 = _d1(S, K, r, sigma, T_years)
    return norm.cdf(d1)
