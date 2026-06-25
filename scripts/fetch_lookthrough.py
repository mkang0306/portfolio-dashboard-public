#!/usr/bin/env python3
"""Look-through analysis: aggregate each portfolio holding's underlying exposures.

For each ETF in the portfolio, fetch top holdings + sector weights via yfinance.
For each individual stock, classify by sector (it contributes 100% to itself).

Usage: fetch_lookthrough.py
  Reads positions+weights from stdin as JSON: {"positions": [{"ticker": "VTI", "weight_pct": 15.3}, ...]}
  Plus optional benchmark for comparison.
Output JSON:
  {
    "underlyings": [
      {"ticker": "NVDA", "name": "NVIDIA Corp", "total_weight": 7.52, "contributions": [{"from": "VTI", "weight": 1.01}, {"from": "NVDA-direct", "weight": 6.41}, ...]}
      ...
    ],
    "sectors": {"technology": 38.4, "financial_services": 8.1, ...},
    "benchmark_sectors": {"technology": 32.1, ...}  # SPY's sector breakdown for comparison
  }
Cache: 24 hours (data changes slowly).
"""
from __future__ import annotations
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import yfinance as yf

CACHE_TTL = 24 * 60 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "lookthrough.json"
BENCHMARK = "SPY"


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


def fetch_etf_details(ticker: str) -> dict:
    """Return {'top_holdings': [{ticker, name, weight}], 'sectors': {sector: weight}}.
    Returns empty if not an ETF or data unavailable."""
    out = {"top_holdings": [], "sectors": {}}
    tk = yf.Ticker(ticker)
    try:
        fd = tk.funds_data
        top = fd.top_holdings
        if top is not None and not top.empty:
            for sym, row in top.iterrows():
                # Some ETFs use foreign ticker formats like 000660.KS — keep the raw symbol
                out["top_holdings"].append({
                    "ticker": str(sym),
                    "name": row.get("Name", str(sym)),
                    "weight": float(row.get("Holding Percent", 0)),
                })
        sec = fd.sector_weightings
        if sec:
            out["sectors"] = {k: float(v) for k, v in sec.items()}
    except Exception:
        pass
    return out


def fetch_stock_sector(ticker: str) -> str | None:
    try:
        info = yf.Ticker(ticker).info
        sec = info.get("sector")
        if not sec:
            return None
        # Normalize to match ETF sector keys (lowercase, underscores)
        return sec.lower().replace(" ", "_").replace("-", "_")
    except Exception:
        return None


def compute_lookthrough(positions: list[dict]) -> dict:
    """positions = [{ticker, weight_pct}]."""
    cache_key = ":".join(f"{p['ticker']}@{round(p['weight_pct'], 1)}" for p in positions)
    cached = load_cache(cache_key)
    if cached is not None:
        return cached

    underlying_totals: dict = {}  # ticker -> {"name", "total", "contributions": [{from, weight}]}
    sector_totals: dict = {}      # sector -> weight (in % of portfolio)

    def add_underlying(ticker, name, contrib_weight, from_holding):
        ticker = ticker.upper() if "." not in ticker else ticker  # preserve foreign suffixes
        if ticker not in underlying_totals:
            underlying_totals[ticker] = {"name": name, "total": 0.0, "contributions": []}
        underlying_totals[ticker]["total"] += contrib_weight
        underlying_totals[ticker]["contributions"].append({
            "from": from_holding, "weight": round(contrib_weight, 3)
        })

    for p in positions:
        ticker = p["ticker"]
        wt_in_port = p["weight_pct"]
        details = fetch_etf_details(ticker)
        # All sector / underlying totals kept in PERCENT of portfolio (e.g., 5.2 means 5.2%).
        if details["top_holdings"] or details["sectors"]:
            # ETF: distribute by underlying weights (weights are 0-1 fractions, wt_in_port is %)
            for h in details["top_holdings"]:
                add_underlying(h["ticker"], h["name"], wt_in_port * h["weight"], ticker)
            for sector, w in details["sectors"].items():
                sector_totals[sector] = sector_totals.get(sector, 0) + wt_in_port * w
            # Account for the part of the ETF NOT in top holdings (the long tail)
            covered = sum(h["weight"] for h in details["top_holdings"])
            tail = max(0, 1.0 - covered)
            if tail > 0.01:
                add_underlying(f"{ticker}-tail", f"{ticker} other holdings", wt_in_port * tail, ticker)
        else:
            # Individual stock or commodity. Adds its full weight to itself + its sector.
            add_underlying(ticker, ticker, wt_in_port, ticker)
            sector = fetch_stock_sector(ticker)
            bucket = sector if sector else "other"
            sector_totals[bucket] = sector_totals.get(bucket, 0) + wt_in_port

    # Sort underlyings desc by total
    underlying_list = sorted(
        [{"ticker": t, **v} for t, v in underlying_totals.items()],
        key=lambda x: -x["total"],
    )

    # Sector totals already in %.
    sector_pct = {k: round(v, 2) for k, v in sector_totals.items()}

    # Benchmark sectors (SPY) — convert fractions to %
    bench = fetch_etf_details(BENCHMARK)
    bench_sectors = {k: round(v * 100, 2) for k, v in bench.get("sectors", {}).items()}

    result = {
        "underlyings": underlying_list,
        "sectors": sector_pct,
        "benchmark": BENCHMARK,
        "benchmark_sectors": bench_sectors,
    }
    save_cache(cache_key, result)
    return result


if __name__ == "__main__":
    inp = json.load(sys.stdin)
    positions = inp.get("positions", [])
    print(json.dumps(compute_lookthrough(positions)))
