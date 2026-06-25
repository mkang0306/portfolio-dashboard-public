#!/usr/bin/env python3
"""Fetch historical prices for multiple tickers via yfinance.

Usage: fetch_history.py PERIOD TICKER [TICKER ...]
  PERIOD ∈ {1d, 5d, 1mo, 3mo, 1y, 5y, max}

Output JSON:
  {
    "timestamps": ["2026-05-22T13:30:00Z", ...],
    "prices": { "VTI": [365.8, 366.1, ...], "NVDA": [...], ... }
  }

Aligned: each ticker's price array indexes into the same timestamps.
Forward-fills missing values to keep arrays aligned.
Caches per (period, sorted-tickers) for 15 minutes.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

import yfinance as yf
import pandas as pd

CACHE_TTL = 15 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "history.json"

PERIOD_TO_INTERVAL = {
    "1d": "5m",
    "5d": "30m",
    "1mo": "1d",
    "3mo": "1d",
    "1y": "1d",
    "5y": "1wk",
    "max": "1wk",
}

# Cap "All" / max period to portfolio-life-relevant range, not full security history.
# Adjust MAX_START_DATE once we know the real earliest purchase date.
MAX_START_DATE = "2020-01-01"


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


def fetch(period: str, tickers: list[str]) -> dict:
    key = f"{period}::{','.join(sorted(tickers))}"
    cached = load_cache(key)
    if cached is not None:
        return cached

    interval = PERIOD_TO_INTERVAL.get(period, "1d")
    download_kwargs = dict(
        tickers=tickers,
        interval=interval,
        auto_adjust=True,
        progress=False,
        threads=True,
        group_by="column",
    )
    if period == "max":
        download_kwargs["start"] = MAX_START_DATE
    else:
        download_kwargs["period"] = period
    df = yf.download(**download_kwargs)
    if df is None or df.empty:
        return {"timestamps": [], "prices": {t: [] for t in tickers}}

    # Pull Close column. For a single ticker yfinance returns a flat DataFrame.
    if len(tickers) == 1:
        closes = df[["Close"]].copy()
        closes.columns = [tickers[0]]
    else:
        closes = df["Close"].copy()

    # Forward-fill any NaN gaps so arrays stay aligned.
    closes = closes.ffill().bfill()

    timestamps = [t.isoformat() for t in closes.index.to_pydatetime()]
    prices = {t: [None if pd.isna(v) else float(v) for v in closes[t].tolist()] for t in closes.columns}

    result = {"timestamps": timestamps, "prices": prices}
    save_cache(key, result)
    return result


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: fetch_history.py PERIOD TICKER [TICKER ...]"}), file=sys.stderr)
        sys.exit(1)
    period = sys.argv[1]
    tickers = sys.argv[2:]
    print(json.dumps(fetch(period, tickers)))
