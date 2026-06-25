#!/usr/bin/env python3
"""Fetch macro signals via yfinance: DXY (dollar), VIX (vol), 10Y yield, oil, gold.

Output JSON: { "DXY": {"label": "Dollar Index", "level": 99.5, "change_1d_pct": -0.2, "change_1mo_pct": -1.8}, ... }

Cache: 1 hour (macro moves slow, no need to hammer Yahoo).
"""
from __future__ import annotations
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import yfinance as yf

CACHE_TTL = 60 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "macro.json"

INDICATORS = {
    "DX-Y.NYB": {"key": "DXY", "label": "Dollar Index (DXY)"},
    "^VIX":      {"key": "VIX", "label": "Volatility Index (VIX)"},
    "^TNX":      {"key": "TNX", "label": "10-Year Treasury Yield"},
    "CL=F":      {"key": "OIL", "label": "Crude Oil (WTI)"},
    "GC=F":      {"key": "GOLD", "label": "Gold Spot"},
    "BTC-USD":   {"key": "BTC", "label": "Bitcoin"},
}


def load_cache():
    if not CACHE_PATH.exists():
        return None
    try:
        blob = json.loads(CACHE_PATH.read_text())
    except json.JSONDecodeError:
        return None
    if time.time() - blob.get("ts", 0) > CACHE_TTL:
        return None
    return blob["data"]


def save_cache(data):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps({"ts": time.time(), "data": data}))


def main():
    cached = load_cache()
    if cached is not None:
        print(json.dumps(cached))
        return

    out = {}
    for sym, meta in INDICATORS.items():
        try:
            tk = yf.Ticker(sym)
            hist = tk.history(period="3mo", interval="1d", auto_adjust=False)
            if hist.empty:
                continue
            closes = hist["Close"].dropna()
            last = float(closes.iloc[-1])
            prev = float(closes.iloc[-2]) if len(closes) >= 2 else last
            mo_ago = float(closes.iloc[-21]) if len(closes) >= 21 else closes.iloc[0]
            out[meta["key"]] = {
                "label": meta["label"],
                "level": round(last, 2),
                "change_1d_pct": round((last / prev - 1) * 100, 2) if prev else None,
                "change_1mo_pct": round((last / mo_ago - 1) * 100, 2) if mo_ago else None,
            }
        except Exception as e:
            out[meta["key"]] = {"label": meta["label"], "error": str(e)}

    save_cache(out)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
