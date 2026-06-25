#!/usr/bin/env python3
"""Fetch recent SEC filings for tickers via EDGAR JSON.

Usage: fetch_sec.py TICKER [TICKER ...]
Output: JSON { "TICKER": {"items": [{"form", "filed", "accession", "url", "primary_doc"}]}, ... }
Cache: 6 hours at .cache/sec.json.
ETFs / non-13F filers usually have no useful filings; we skip silently.
"""
from __future__ import annotations
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

CACHE_TTL = 6 * 60 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "sec.json"
TICKER_MAP_PATH = Path(__file__).resolve().parent.parent / ".cache" / "sec_tickers.json"
TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
USER_AGENT = os.environ.get("SEC_USER_AGENT", "Portfolio Dashboard user@example.com")
RELEVANT_FORMS = {"10-K", "10-Q", "8-K", "DEF 14A", "S-1"}
MAX_ITEMS = 8


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


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


def load_ticker_map() -> dict:
    if TICKER_MAP_PATH.exists() and time.time() - TICKER_MAP_PATH.stat().st_mtime < 7 * 24 * 3600:
        return json.loads(TICKER_MAP_PATH.read_text())
    data = json.loads(http_get(TICKER_MAP_URL))
    TICKER_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    TICKER_MAP_PATH.write_text(json.dumps(data))
    return data


def cik_for(ticker: str, table: dict) -> str | None:
    t = ticker.upper()
    for row in table.values():
        if row.get("ticker", "").upper() == t:
            return f"{int(row['cik_str']):010d}"
    return None


def fetch_one(ticker: str, table: dict) -> dict:
    cik = cik_for(ticker, table)
    if cik is None:
        return {"items": [], "note": "no CIK (likely ETF or non-US listing)"}
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    try:
        sub = json.loads(http_get(url))
    except Exception as e:
        return {"items": [], "error": str(e)}
    recent = sub.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accs = recent.get("accessionNumber", [])
    primary = recent.get("primaryDocument", [])

    items = []
    for f, d, a, p in zip(forms, dates, accs, primary):
        if f not in RELEVANT_FORMS:
            continue
        acc_nodash = a.replace("-", "")
        items.append({
            "form": f,
            "filed": d,
            "accession": a,
            "primary_doc": p,
            "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_nodash}/{p}",
        })
        if len(items) >= MAX_ITEMS:
            break
    return {"items": items, "cik": cik}


def fetch(tickers: list[str]) -> dict:
    key = ",".join(sorted(tickers))
    cached = load_cache(key)
    if cached is not None:
        return cached
    table = load_ticker_map()
    out = {t: fetch_one(t, table) for t in tickers}
    save_cache(key, out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no tickers"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(fetch(sys.argv[1:])))
