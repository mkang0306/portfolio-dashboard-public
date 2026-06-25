#!/usr/bin/env python3
"""Recent insider transactions for tickers via yfinance.

Usage: fetch_insiders.py TICKER [TICKER ...]
Output JSON: { "TICKER": [{insider, position, transaction, date, shares, value, ownership}, ...] }
Only buys/grants in the last 90 days. Sells filtered out (less informative).
Cache: 4 hours.
"""
from __future__ import annotations
import json
import sys
import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

import yfinance as yf

CACHE_TTL = 4 * 60 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "insiders.json"
LOOKBACK_DAYS = 90


def load_cache(key):
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


def save_cache(key, data):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    blob = {}
    if CACHE_PATH.exists():
        try:
            blob = json.loads(CACHE_PATH.read_text())
        except json.JSONDecodeError:
            pass
    blob[key] = {"ts": time.time(), "data": data}
    CACHE_PATH.write_text(json.dumps(blob))


def fetch_one(ticker: str) -> list[dict]:
    try:
        tk = yf.Ticker(ticker)
        df = tk.insider_transactions
        if df is None or df.empty:
            return []
    except Exception:
        return []

    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    out = []
    for _, row in df.iterrows():
        try:
            date = row.get("Start Date")
            if date is None:
                continue
            d = date.to_pydatetime() if hasattr(date, "to_pydatetime") else date
            if d < cutoff:
                continue
            txn = str(row.get("Transaction", "")).lower()
            # Keep only purchases / grants — sells are noisy and tax-driven
            if "purchase" not in txn and "buy" not in txn and "grant" not in txn:
                continue
            shares = row.get("Shares")
            value = row.get("Value")
            out.append({
                "insider": str(row.get("Insider", "")),
                "position": str(row.get("Position", "")),
                "transaction": str(row.get("Transaction", "")),
                "date": d.strftime("%Y-%m-%d"),
                "shares": int(shares) if shares and not (isinstance(shares, float) and shares != shares) else None,
                "value": float(value) if value and not (isinstance(value, float) and value != value) else None,
                "ownership": str(row.get("Ownership", "")),
            })
        except Exception:
            continue

    return out[:8]  # cap noise


def main():
    if len(sys.argv) < 2:
        print(json.dumps({}))
        return
    tickers = sys.argv[1:]
    key = ",".join(sorted(tickers))
    cached = load_cache(key)
    if cached is not None:
        print(json.dumps(cached))
        return
    out = {t: fetch_one(t) for t in tickers}
    save_cache(key, out)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
