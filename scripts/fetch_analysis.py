#!/usr/bin/env python3
"""Compute correlation matrix, drawdowns, and performance attribution for the portfolio.

Usage: fetch_analysis.py
  Reads from stdin: {"positions": [{"ticker", "shares", "weight_pct"}, ...]}
Output JSON: {
  "correlations": [[1.0, 0.85, ...], ...],   # NxN matrix
  "tickers": ["VTI", "NVDA", ...],            # row/column order
  "drawdowns": {
    "portfolio": {"current_pct": -2.3, "ath_date": "2026-05-15", "current_date": "2026-05-23", "ath_value": 33700},
    "per_position": [{"ticker", "current_pct", "ath_date"}, ...]
  },
  "attribution": {
    "1d":  {"total_pct": +0.4, "contributions": [{"ticker", "weight_pct", "return_pct", "contribution_pct"}, ...]},
    "5d":  {...},
    "1mo": {...},
    "ytd": {...}
  }
}
Cache: 30 min.
"""
from __future__ import annotations
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import yfinance as yf
import pandas as pd
import numpy as np

CACHE_TTL = 30 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "analysis.json"


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


def compute(positions: list[dict]) -> dict:
    tickers = [p["ticker"] for p in positions]
    key = ":".join(f"{p['ticker']}@{p['shares']}" for p in positions)
    cached = load_cache(key)
    if cached is not None:
        return cached

    df = yf.download(
        tickers=tickers, period="1y", interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="column",
    )
    if df is None or df.empty:
        return {"error": "no data"}
    closes = df["Close"] if len(tickers) > 1 else pd.DataFrame({tickers[0]: df["Close"]})
    closes = closes.ffill().bfill()

    # Daily returns
    returns = closes.pct_change().dropna()

    # Correlation matrix (Pearson)
    corr = returns.corr().reindex(index=tickers, columns=tickers)
    corr_matrix = [[round(float(corr.iloc[i, j]), 3) if not pd.isna(corr.iloc[i, j]) else None
                    for j in range(len(tickers))] for i in range(len(tickers))]

    # Portfolio value over time
    shares = {p["ticker"]: float(p["shares"]) for p in positions}
    port_value = pd.Series(0.0, index=closes.index)
    for t in tickers:
        port_value += closes[t] * shares[t]

    # Drawdown
    running_max = port_value.cummax()
    drawdown_pct = (port_value / running_max - 1) * 100
    current_dd = float(drawdown_pct.iloc[-1])
    ath_idx = int(port_value.idxmax().value)
    ath_date = port_value.idxmax().strftime("%Y-%m-%d")
    ath_value = float(port_value.max())
    cur_date = port_value.index[-1].strftime("%Y-%m-%d")
    cur_value = float(port_value.iloc[-1])

    # Per-position drawdown
    per_pos_dd = []
    for t in tickers:
        s = closes[t].dropna()
        if s.empty:
            continue
        rmax = s.cummax()
        dd = (s.iloc[-1] / rmax.iloc[-1] - 1) * 100
        per_pos_dd.append({
            "ticker": t,
            "current_pct": round(float(dd), 2),
            "ath_date": s.idxmax().strftime("%Y-%m-%d"),
            "current_price": round(float(s.iloc[-1]), 2),
            "ath_price": round(float(s.max()), 2),
        })
    per_pos_dd.sort(key=lambda x: x["current_pct"])

    # Attribution per window
    def attribution_for_window(n_days_back: int) -> dict:
        if len(closes) <= n_days_back:
            return {"total_pct": None, "contributions": []}
        end_prices = closes.iloc[-1]
        start_prices = closes.iloc[-1 - n_days_back]
        end_val = sum(end_prices[t] * shares[t] for t in tickers)
        start_val = sum(start_prices[t] * shares[t] for t in tickers)
        if start_val <= 0:
            return {"total_pct": None, "contributions": []}
        total_pct = (end_val / start_val - 1) * 100
        contribs = []
        for t in tickers:
            ret_pct = (end_prices[t] / start_prices[t] - 1) * 100
            start_weight = (start_prices[t] * shares[t]) / start_val * 100
            # Contribution to portfolio return ≈ start_weight * return
            contrib = (start_weight / 100) * ret_pct
            contribs.append({
                "ticker": t,
                "weight_pct": round(float(start_weight), 2),
                "return_pct": round(float(ret_pct), 2),
                "contribution_pct": round(float(contrib), 3),
            })
        contribs.sort(key=lambda x: -x["contribution_pct"])
        return {"total_pct": round(float(total_pct), 2), "contributions": contribs}

    attribution = {
        "1d": attribution_for_window(1),
        "5d": attribution_for_window(5),
        "1mo": attribution_for_window(21),
        "ytd": (lambda: (
            # YTD: find first trading day of current year
            (lambda first_idx:
                attribution_for_window(len(closes) - 1 - first_idx) if first_idx >= 0 else {"total_pct": None, "contributions": []}
            )([i for i, ts in enumerate(closes.index) if ts.year == closes.index[-1].year][0] if any(ts.year == closes.index[-1].year for ts in closes.index) else -1)
        ))(),
    }

    result = {
        "tickers": tickers,
        "correlations": corr_matrix,
        "drawdowns": {
            "portfolio": {
                "current_pct": round(current_dd, 2),
                "ath_date": ath_date,
                "ath_value": round(ath_value, 2),
                "current_date": cur_date,
                "current_value": round(cur_value, 2),
            },
            "per_position": per_pos_dd,
        },
        "attribution": attribution,
    }
    _ = ath_idx  # unused
    save_cache(key, result)
    return result


if __name__ == "__main__":
    inp = json.load(sys.stdin)
    print(json.dumps(compute(inp.get("positions", []))))
