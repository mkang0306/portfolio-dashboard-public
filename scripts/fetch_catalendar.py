#!/usr/bin/env python3
"""Catalyst calendar: upcoming earnings dates + macro events + position-specific catalysts.

Patterns from .claude/skills/equity-research/skills/catalyst-calendar/SKILL.md
- Date | Event | Company/Sector | Type | Impact (H/M/L) | Notes
- Earnings: per-ticker via yfinance Ticker.calendar
- Macro: hardcoded calendar of known recurring + scheduled events
- Position-specific: read from data/catalysts.yaml

Usage:
  Reads holdings from data/holdings.yaml. Outputs structured JSON of events
  within the next N days (default 60).

  python scripts/fetch_catalendar.py            # all events
  python scripts/fetch_catalendar.py --days 30  # next 30 days only
"""
from __future__ import annotations
import json
import sys
import time
import warnings
from datetime import date, datetime, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

import yaml
import yfinance as yf

CACHE_TTL = 6 * 60 * 60   # earnings dates shift; refresh every 6h
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "catalendar.json"
ROOT = Path(__file__).resolve().parent.parent

# Hardcoded macro calendar. Sources: Federal Reserve calendar, BLS release schedule.
# Refresh quarterly as new FOMC dates / CPI release dates are announced.
# Format: (date, name, impact)
MACRO_EVENTS: list[tuple[str, str, str]] = [
    # FOMC 2026 (8 scheduled meetings)
    ("2026-06-17", "FOMC Meeting + rate decision", "high"),
    ("2026-07-29", "FOMC Meeting + rate decision", "high"),
    ("2026-09-16", "FOMC Meeting + rate decision", "high"),
    ("2026-11-04", "FOMC Meeting + rate decision", "high"),
    ("2026-12-16", "FOMC Meeting + rate decision", "high"),
    # CPI releases (typically 2nd week of month)
    ("2026-06-11", "CPI release (May)", "high"),
    ("2026-07-15", "CPI release (June)", "high"),
    ("2026-08-12", "CPI release (July)", "high"),
    # Jobs report (1st Friday)
    ("2026-06-05", "Jobs report (May payrolls)", "high"),
    ("2026-07-03", "Jobs report (June payrolls)", "high"),
    ("2026-08-07", "Jobs report (July payrolls)", "high"),
    # GDP (advance) — Q2 advance estimate late July
    ("2026-07-30", "GDP advance estimate (Q2)", "medium"),
    # PCE inflation (Fed's preferred metric)
    ("2026-05-30", "Core PCE release (April)", "high"),
    ("2026-06-27", "Core PCE release (May)", "high"),
]


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


def fetch_earnings(tickers: list[str]) -> list[dict]:
    """For each ticker, get the next earnings date if available."""
    out = []
    for t in tickers:
        try:
            cal = yf.Ticker(t).calendar
            if not cal:
                continue
            # yfinance returns a dict with 'Earnings Date' as a list of datetimes
            dates = cal.get("Earnings Date") if isinstance(cal, dict) else None
            if not dates:
                continue
            for d in (dates if isinstance(dates, list) else [dates]):
                # d can be a date, datetime, or pandas Timestamp
                try:
                    d_str = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)
                except Exception:
                    continue
                out.append({
                    "date": d_str,
                    "ticker": t,
                    "name": f"{t} earnings",
                    "type": "earnings",
                    "impact": "high",
                    "notes": "Verify with company IR closer to date — dates shift.",
                })
                break  # next-earnings only, not all future
        except Exception:
            continue
    return out


def load_holdings_tickers() -> list[str]:
    cfg = yaml.safe_load((ROOT / "data" / "holdings.yaml").read_text())
    return [h["ticker"] for h in cfg["holdings"]]


def load_manual_catalysts() -> list[dict]:
    path = ROOT / "data" / "catalysts.yaml"
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text())
    except Exception:
        return []
    out = []
    for e in (data or {}).get("catalysts", []):
        raw_date = e.get("date")
        if not raw_date:
            continue
        # PyYAML auto-parses ISO date strings into date objects; coerce to string
        date_str = raw_date.isoformat() if hasattr(raw_date, "isoformat") else str(raw_date)
        out.append({
            "date": date_str,
            "ticker": e.get("ticker"),
            "name": e.get("name", "—"),
            "type": e.get("type", "corporate"),
            "impact": e.get("impact", "medium"),
            "notes": e.get("notes", ""),
        })
    return out


def main():
    days = 60
    if "--days" in sys.argv:
        idx = sys.argv.index("--days")
        if idx + 1 < len(sys.argv):
            try: days = int(sys.argv[idx + 1])
            except ValueError: pass

    tickers = load_holdings_tickers()
    cache_key = f"{days}::{','.join(sorted(tickers))}"
    cached = load_cache(cache_key)
    if cached is not None:
        print(json.dumps(cached))
        return

    today = date.today()
    horizon = today + timedelta(days=days)

    all_events = []
    # Earnings
    all_events.extend(fetch_earnings(tickers))
    # Macro (hardcoded)
    for d_str, name, impact in MACRO_EVENTS:
        all_events.append({
            "date": d_str,
            "ticker": None,
            "name": name,
            "type": "macro",
            "impact": impact,
            "notes": "Refresh quarterly as Fed/BLS announce new dates.",
        })
    # Manual position-specific
    all_events.extend(load_manual_catalysts())

    # Filter to horizon + future only
    filtered = []
    for e in all_events:
        try:
            d = datetime.strptime(e["date"], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        if d < today or d > horizon:
            continue
        e["days_away"] = (d - today).days
        filtered.append(e)

    filtered.sort(key=lambda x: (x["date"], x.get("ticker") or ""))

    result = {"horizon_days": days, "today": today.isoformat(), "events": filtered}
    save_cache(cache_key, result)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
