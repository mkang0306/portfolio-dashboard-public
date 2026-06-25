#!/usr/bin/env python3
"""Generate thesis-aligned daily digest for the portfolio.

Runs in either local venv or GitHub Actions. Outputs a single markdown file
at digests/YYYY-MM-DD.md.

Steps:
  1. Load holdings.yaml + thesis.md
  2. For each ticker: fetch Yahoo news + (for stocks) SEC filings
  3. Call Anthropic API with web_search tool, prompt-cached thesis system block
  4. Aggregate items; write structured markdown digest

Env:
  ANTHROPIC_API_KEY  (required)

Usage:
  python scripts/daily_digest.py            # all holdings
  python scripts/daily_digest.py NVDA AAPL  # subset for testing
"""
from __future__ import annotations
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import yaml
import yfinance as yf
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parent.parent
HOLDINGS = ROOT / "data" / "holdings.yaml"
THESIS = ROOT / "data" / "thesis.md"
DIGESTS = ROOT / "digests"
MODEL = "claude-sonnet-4-6"
EDGAR_UA = os.environ.get("SEC_USER_AGENT", "Portfolio Dashboard user@example.com")
RELEVANT_FORMS = {"10-K", "10-Q", "8-K"}


# ---------- source fetchers ----------

def fetch_yahoo_news(ticker: str, max_items: int = 10) -> list[dict]:
    try:
        raw = yf.Ticker(ticker).news or []
    except Exception as e:
        return [{"_error": str(e)}]
    items = []
    for it in raw[:max_items]:
        if "content" in it and isinstance(it["content"], dict):
            c = it["content"]
            items.append({
                "title": c.get("title", ""),
                "publisher": (c.get("provider") or {}).get("displayName", ""),
                "link": (c.get("clickThroughUrl") or {}).get("url") or (c.get("canonicalUrl") or {}).get("url", ""),
                "published": c.get("pubDate", ""),
            })
        else:
            ts = it.get("providerPublishTime")
            items.append({
                "title": it.get("title", ""),
                "publisher": it.get("publisher", ""),
                "link": it.get("link", ""),
                "published": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else "",
            })
    return [i for i in items if i.get("title")]


_TICKER_MAP: dict | None = None

def _ticker_map() -> dict:
    global _TICKER_MAP
    if _TICKER_MAP is not None:
        return _TICKER_MAP
    req = urllib.request.Request(
        "https://www.sec.gov/files/company_tickers.json",
        headers={"User-Agent": EDGAR_UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        _TICKER_MAP = json.loads(r.read())
    return _TICKER_MAP


def fetch_sec(ticker: str, max_items: int = 5) -> list[dict]:
    table = _ticker_map()
    cik = None
    for row in table.values():
        if row.get("ticker", "").upper() == ticker.upper():
            cik = f"{int(row['cik_str']):010d}"
            break
    if not cik:
        return []
    try:
        req = urllib.request.Request(
            f"https://data.sec.gov/submissions/CIK{cik}.json",
            headers={"User-Agent": EDGAR_UA, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            sub = json.loads(r.read())
    except Exception:
        return []
    recent = sub.get("filings", {}).get("recent", {})
    out = []
    for f, d, a, p in zip(
        recent.get("form", []),
        recent.get("filingDate", []),
        recent.get("accessionNumber", []),
        recent.get("primaryDocument", []),
    ):
        if f not in RELEVANT_FORMS:
            continue
        out.append({
            "form": f,
            "filed": d,
            "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{a.replace('-', '')}/{p}",
        })
        if len(out) >= max_items:
            break
    return out


# ---------- Claude classification ----------

def build_system_prompt(holding: dict, thesis: str) -> str:
    triggers = (
        "\n".join(f"  - {t}" for t in holding.get("sell_triggers", []))
        if holding.get("sell_triggers")
        else "  (none defined yet — flag candidates worth writing down)"
    )
    return f"""You are a thesis-aligned research analyst for Minho's personal portfolio.

Classify news items against his written thesis. No buy/sell recommendations. No generic market commentary. JSON only.

================================
PORTFOLIO THESIS (canonical)
================================
{thesis}

================================
POSITION UNDER REVIEW
================================
Ticker: {holding["ticker"]}
Name: {holding["name"]}
Function: {holding["function"]}
Per-position thesis: {holding["thesis"]}
Target weight: {holding["target_pct"]}%
Account: {holding["account"]}
Written sell triggers:
{triggers}

================================
CLASSIFICATION RUBRIC
================================
- "confirms"        — strengthens the thesis or per-position rationale
- "neutral"         — relevant context but doesn't move the thesis
- "contradicts"     — weakens the thesis or per-position rationale
- "trigger_match"   — directly matches a written sell trigger above. Use sparingly.

================================
OUTPUT FORMAT
================================
Return ONLY a JSON object inside one ```json``` block:

{{
  "summary": "2-3 sentence overview of what's moved for this position in the last ~30 days",
  "items": [
    {{ "headline": "...", "source": "...", "url": "...", "classification": "confirms"|"neutral"|"contradicts"|"trigger_match", "reasoning": "..." }}
  ]
}}

Rules:
- 5-10 items max, prioritized by importance.
- Merge near-duplicates from different sources.
- Skip generic market noise.
- Every reasoning must reference a specific clause of the thesis or trigger.
- Authoritative SEC filings (revenue miss, segment shift, major litigation) get priority.
- Use web_search to fill obvious gaps in the bundled corpus (capped)."""


def format_corpus(yahoo: list[dict], sec: list[dict]) -> str:
    blocks = []
    if yahoo:
        blocks.append("## Yahoo Finance ticker news")
        for y in yahoo:
            blocks.append(f"- [{y['publisher']}] {y['title']} ({y['published']}) — {y['link']}")
    if sec:
        blocks.append("\n## SEC filings (EDGAR)")
        for s in sec:
            blocks.append(f"- {s['form']} filed {s['filed']} — {s['url']}")
    return "\n".join(blocks) if blocks else "(No items from local sources. Use web_search.)"


def parse_json_block(text: str) -> dict:
    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    raw = m.group(1) if m else (re.search(r"\{[\s\S]*\}", text) or [None])[0]
    if not raw:
        raise ValueError(f"No JSON: {text[:300]}")
    return json.loads(raw)


def classify(client: Anthropic, holding: dict, thesis: str) -> dict:
    yahoo = fetch_yahoo_news(holding["ticker"])
    sec = fetch_sec(holding["ticker"]) if holding.get("expense_ratio") is None else []
    corpus = format_corpus(yahoo, sec)

    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": build_system_prompt(holding, thesis),
            "cache_control": {"type": "ephemeral"},
        }],
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 4}],
        messages=[{"role": "user", "content": f"Bundled corpus for {holding['ticker']}:\n\n{corpus}\n\nClassify each item. Use web_search to fill gaps. Return JSON."}],
    )
    text = "\n".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    parsed = parse_json_block(text)
    return {
        "ticker": holding["ticker"],
        "summary": parsed.get("summary", ""),
        "items": parsed.get("items", []),
        "sources_used": {"yahoo": len(yahoo), "sec": len(sec)},
    }


# ---------- digest rendering ----------

BADGE = {
    "trigger_match": "🚨 TRIGGER",
    "contradicts": "⚠ CONTRADICTS",
    "confirms": "✓ CONFIRMS",
    "neutral": "· neutral",
}
PRIORITY = {"trigger_match": 0, "contradicts": 1, "confirms": 2, "neutral": 3}


def render_digest(results: list[dict], errors: list[tuple[str, str]]) -> str:
    today = date.today().isoformat()
    triggers, contras, confirms, by_ticker = [], [], [], {}
    empty_tickers = []
    for r in results:
        if not r["items"]:
            empty_tickers.append(r["ticker"])
        for it in r["items"]:
            row = (r["ticker"], it)
            cls = it.get("classification", "neutral")
            if cls == "trigger_match":
                triggers.append(row)
            elif cls == "contradicts":
                contras.append(row)
            elif cls == "confirms":
                confirms.append(row)
        by_ticker[r["ticker"]] = r

    lines = [
        f"# Portfolio Digest — {today}",
        "",
        f"_Generated by daily_digest.py · {len(results)} positions processed · {len(errors)} errors_",
        "",
        f"**Headline:** {len(triggers)} trigger match{'es' if len(triggers) != 1 else ''}, "
        f"{len(contras)} contradiction{'s' if len(contras) != 1 else ''}, "
        f"{len(confirms)} confirmation{'s' if len(confirms) != 1 else ''}.",
        "",
    ]

    def render_item(ticker: str, it: dict) -> list[str]:
        cls = it.get("classification", "neutral")
        out = [f"### {BADGE.get(cls, cls)} · `{ticker}` · {it.get('headline', '')}"]
        src = it.get("source", "")
        url = it.get("url", "")
        if src or url:
            out.append(f"_Source: {src}{' — ' + url if url else ''}_")
        out.append("")
        out.append(it.get("reasoning", ""))
        out.append("")
        return out

    if triggers:
        lines += ["## 🚨 Sell-Trigger Candidates", ""]
        for t, it in triggers:
            lines += render_item(t, it)
    if contras:
        lines += ["## ⚠ Contradictions", ""]
        for t, it in contras:
            lines += render_item(t, it)
    if confirms:
        lines += ["## ✓ Confirmations", ""]
        for t, it in sorted(confirms, key=lambda x: x[0]):
            lines += render_item(t, it)

    lines += ["## Position Summaries", ""]
    for ticker, r in sorted(by_ticker.items()):
        s = r["sources_used"]
        lines.append(f"- **{ticker}** — {r['summary']} _(Yahoo {s['yahoo']} · SEC {s['sec']} · +web)_")

    if empty_tickers:
        lines += ["", f"_No thesis-relevant items surfaced for: {', '.join(empty_tickers)}._"]
    if errors:
        lines += ["", "## Errors", ""]
        for t, e in errors:
            lines.append(f"- {t}: {e}")

    return "\n".join(lines) + "\n"


# ---------- main ----------

def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    cfg = yaml.safe_load(HOLDINGS.read_text())
    thesis = THESIS.read_text()
    client = Anthropic()

    only = [t.upper() for t in sys.argv[1:]]
    targets = [h for h in cfg["holdings"] if not only or h["ticker"] in only]

    results, errors = [], []
    for h in targets:
        t0 = time.time()
        try:
            results.append(classify(client, h, thesis))
            print(f"  ✓ {h['ticker']} in {time.time() - t0:.1f}s", file=sys.stderr)
        except Exception as e:
            errors.append((h["ticker"], str(e)))
            print(f"  ✗ {h['ticker']}: {e}", file=sys.stderr)

    digest = render_digest(results, errors)
    DIGESTS.mkdir(exist_ok=True)
    today = date.today().isoformat()
    out = DIGESTS / f"{today}.md"
    out.write_text(digest)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
