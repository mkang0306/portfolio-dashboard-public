#!/usr/bin/env python3
"""Screener: for a list of tickers, return last price + multi-period returns + 52-week stats.

Usage: fetch_screener.py TICKER [TICKER ...]
Output JSON:
  {
    "TICKER": {
      "price": 215.33,
      "name": "NVIDIA Corp",
      "returns": {"1d": -2.18, "5d": 1.2, "1mo": 7.9, "3mo": 18.5, "1y": 58.0, "ytd": 12.4},
      "high_52w": 240.10,
      "low_52w": 95.20,
      "pct_off_high": -10.3
    },
    ...
  }
Cache: 30 min.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

import yfinance as yf
import pandas as pd

CACHE_TTL = 30 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "screener.json"


def load_cache(key: str):
    if not CACHE_PATH.exists():
        return None
    try:
        blob = json.loads(CACHE_PATH.read_text())
    except json.JSONDecodeError:
        return None
    entry = blob.get(key)
    if not entry or time.time() - entry["ts"] > CACHE_TTL:
        return None
    return entry["data"]


def save_cache(key: str, data):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    blob = {}
    if CACHE_PATH.exists():
        try:
            blob = json.loads(CACHE_PATH.read_text())
        except json.JSONDecodeError:
            pass
    blob[key] = {"ts": time.time(), "data": data}
    CACHE_PATH.write_text(json.dumps(blob))


def pct(a: float, b: float) -> float | None:
    if not a or pd.isna(a) or pd.isna(b):
        return None
    return round((b - a) / a * 100, 2)


def compute(closes: pd.Series, ticker: str) -> dict:
    """Given a Series of daily Close prices indexed by date, compute metrics."""
    if closes is None or closes.dropna().empty:
        return {"price": None, "returns": {}, "high_52w": None, "low_52w": None, "pct_off_high": None}
    closes = closes.dropna()
    last = float(closes.iloc[-1])

    def lookup(n_days_back: int) -> float | None:
        if len(closes) <= n_days_back:
            return None
        return float(closes.iloc[-1 - n_days_back])

    # Approximate trading days. Better: index by date — but a rough lookup back N rows is fine.
    returns = {
        "1d": pct(lookup(1), last) if lookup(1) is not None else None,
        "5d": pct(lookup(5), last) if lookup(5) is not None else None,
        "1mo": pct(lookup(21), last) if lookup(21) is not None else None,
        "3mo": pct(lookup(63), last) if lookup(63) is not None else None,
        "1y": pct(lookup(252), last) if lookup(252) is not None else None,
    }
    # YTD
    this_year = closes.index[-1].year
    ytd_slice = closes[closes.index.year == this_year]
    if not ytd_slice.empty:
        returns["ytd"] = pct(float(ytd_slice.iloc[0]), last)

    last_year = closes.tail(252) if len(closes) > 252 else closes
    high_52w = float(last_year.max())
    low_52w = float(last_year.min())
    pct_off_high = pct(high_52w, last)

    return {
        "price": round(last, 2),
        "returns": {k: v for k, v in returns.items() if v is not None},
        "high_52w": round(high_52w, 2),
        "low_52w": round(low_52w, 2),
        "pct_off_high": pct_off_high,
    }


def fetch(tickers: list[str]) -> dict:
    key = ",".join(sorted(tickers))
    cached = load_cache(key)
    if cached is not None:
        return cached

    df = yf.download(
        tickers=tickers,
        period="1y",
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=True,
        group_by="column",
    )
    if df is None or df.empty:
        return {t: {} for t in tickers}

    # Normalize: single ticker comes back flat
    if len(tickers) == 1:
        closes_all = pd.DataFrame({tickers[0]: df["Close"]})
    else:
        closes_all = df["Close"].copy()

    out: dict = {}
    for t in tickers:
        if t not in closes_all.columns:
            out[t] = {}
            continue
        out[t] = compute(closes_all[t], t)

    save_cache(key, out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no tickers"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(fetch(sys.argv[1:])))
