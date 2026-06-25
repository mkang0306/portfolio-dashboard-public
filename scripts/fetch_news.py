#!/usr/bin/env python3
"""Fetch recent news for tickers via yfinance.

Usage: fetch_news.py TICKER [TICKER ...]
Output: JSON { "TICKER": [{"title", "publisher", "link", "published"}, ...], ... }
Cache: 30 minutes at .cache/news.json keyed by sorted ticker tuple.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

CACHE_TTL = 30 * 60
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "news.json"
MAX_ITEMS = 12


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


def normalize(item: dict) -> dict:
    # yfinance has shifted shapes; handle both legacy flat and new "content" nested form.
    if "content" in item and isinstance(item["content"], dict):
        c = item["content"]
        provider = (c.get("provider") or {}).get("displayName", "")
        click = (c.get("clickThroughUrl") or {}).get("url") or (c.get("canonicalUrl") or {}).get("url", "")
        pub = c.get("pubDate") or ""
        return {
            "title": c.get("title", ""),
            "publisher": provider,
            "link": click,
            "published": pub,
        }
    ts = item.get("providerPublishTime")
    return {
        "title": item.get("title", ""),
        "publisher": item.get("publisher", ""),
        "link": item.get("link", ""),
        "published": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else "",
    }


def fetch(tickers: list[str]) -> dict:
    key = ",".join(sorted(tickers))
    cached = load_cache(key)
    if cached is not None:
        return cached

    out: dict = {}
    for t in tickers:
        try:
            raw = yf.Ticker(t).news or []
        except Exception as e:
            out[t] = {"error": str(e), "items": []}
            continue
        items = [normalize(x) for x in raw[:MAX_ITEMS]]
        items = [x for x in items if x["title"]]
        out[t] = {"items": items}

    save_cache(key, out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no tickers"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(fetch(sys.argv[1:])))
