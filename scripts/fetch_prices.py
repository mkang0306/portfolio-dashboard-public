#!/usr/bin/env python3
"""Batch-fetch live prices for tickers via yfinance.

Usage: fetch_prices.py TICKER [TICKER ...]
Output: JSON to stdout: { "TICKER": {"price": float, "prev_close": float, "currency": str}, ... }
Cache: 15 minutes at .cache/prices.json (keyed by sorted ticker tuple).
"""
import json
import sys
import time
from pathlib import Path

import yfinance as yf

CACHE_TTL = 15 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "prices.json"


def load_cache(key: str):
    if not CACHE_PATH.exists():
        return None
    try:
        blob = json.loads(CACHE_PATH.read_text())
    except json.JSONDecodeError:
        return None
    entry = blob.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > CACHE_TTL:
        return None
    return entry["data"]


def save_cache(key: str, data: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    blob = {}
    if CACHE_PATH.exists():
        try:
            blob = json.loads(CACHE_PATH.read_text())
        except json.JSONDecodeError:
            blob = {}
    blob[key] = {"ts": time.time(), "data": data}
    CACHE_PATH.write_text(json.dumps(blob))


def fetch(tickers: list[str]) -> dict:
    key = ",".join(sorted(tickers))
    cached = load_cache(key)
    if cached is not None:
        return cached

    out: dict = {}
    data = yf.Tickers(" ".join(tickers))
    for t in tickers:
        info = data.tickers[t].fast_info
        try:
            price = float(info.last_price)
        except Exception:
            price = None
        try:
            prev = float(info.previous_close)
        except Exception:
            prev = None
        try:
            currency = info.currency or "USD"
        except Exception:
            currency = "USD"
        out[t] = {"price": price, "prev_close": prev, "currency": currency}

    save_cache(key, out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no tickers"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(fetch(sys.argv[1:])))
