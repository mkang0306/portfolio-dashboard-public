#!/usr/bin/env python3
"""Weekly thesis-fit scan.

For each candidate ticker (top performers from screener + any names Claude surfaces via web search),
score against the user's written thesis. Output a structured markdown digest at
discover/YYYY-MM-DD-thesis-fit.md.

Sections produced:
  1. Top new candidates (5 names not currently held, ranked by thesis fit)
  2. Adjacent-to-conviction (one alt name per high-conviction position)
  3. Cheaper / better ETF replacements (when applicable)
  4. Consolidation candidates (when applicable)

Runs in GitHub Actions weekly (Sunday 8pm PT) OR locally on demand.
Cost: one Sonnet call with web search, ~$0.05–0.10 per run.

Usage:
  python scripts/thesis_fit.py            # full run
  python scripts/thesis_fit.py --dry-run  # print to stdout, don't write
"""
from __future__ import annotations
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

import yaml
import yfinance as yf
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parent.parent
HOLDINGS = ROOT / "data" / "holdings.yaml"
THESIS = ROOT / "data" / "thesis.md"
DECLINED = ROOT / "data" / "declined.yaml"
OUT_DIR = ROOT / "discover"
MODEL = "claude-sonnet-4-6"


def load_declined_tickers() -> set[str]:
    """Load tickers that have been explicitly declined. Excluded from candidate universe."""
    if not DECLINED.exists():
        return set()
    try:
        data = yaml.safe_load(DECLINED.read_text())
        return {d["ticker"] for d in (data.get("declined") or []) if d.get("ticker")}
    except Exception:
        return set()

# Candidate universe: top performers in each of Minho's themes (≈75 tickers).
# Same universe used by /api/discover/winners, kept in sync manually.
CANDIDATE_UNIVERSE = [
    # Mag 7 + AI compute
    "AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT", "TSLA",
    "AMD", "AVGO", "TSM", "ASML", "ARM", "MRVL", "AMAT", "LRCX", "KLAC",
    "ORCL", "CRM", "NOW", "PLTR", "SNOW", "DDOG",
    # Memory / HBM
    "DRAM", "MU", "WDC", "STX", "ENTG", "ACLS",
    # Quantum + adjacents
    "QTUM", "IONQ", "RGTI", "QBTS", "ARQQ", "IBM", "HON", "INTC",
    # Korea + EM Asia
    "EWY", "KORU", "FLKR", "KB", "SHG", "KEP",
    "EEM", "VWO", "MCHI", "INDA",
    # International developed
    "VXUS", "IXUS", "VEA", "IEFA", "EWJ", "EWG", "ACWX",
    # US core / factor
    "VTI", "AVUS", "AVUV", "SCHB", "VOO", "AVGE", "DFAU",
    "DFSV", "IJS", "VBR", "AVDV", "CALF",
    # Hedge
    "GLD", "IAU", "SGOL", "GLDM", "SLV", "DBC", "PDBC",
]


def fetch_returns(tickers: list[str]) -> dict:
    """Return per-ticker {price, ret_1mo, ret_3mo, ret_ytd, pct_off_52w_high} for ranking + multi-factor scoring (pe_ttm, fcf_yield_pct, roic_pct, market_cap_b)."""
    import pandas as pd

    df = yf.download(
        tickers=tickers, period="1y", interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="column",
    )
    if df is None or df.empty:
        return {}
    closes = df["Close"] if len(tickers) > 1 else pd.DataFrame({tickers[0]: df["Close"]})
    closes = closes.ffill()

    out: dict = {}
    for t in tickers:
        if t not in closes.columns:
            continue
        s = closes[t].dropna()
        if s.empty:
            continue
        last = float(s.iloc[-1])
        this_year_start = s[s.index.year == s.index[-1].year].iloc[0] if (s.index.year == s.index[-1].year).any() else last
        entry = {
            "price": round(last, 2),
            "ret_1mo": round((last / float(s.iloc[-21]) - 1) * 100, 1) if len(s) > 21 else None,
            "ret_3mo": round((last / float(s.iloc[-63]) - 1) * 100, 1) if len(s) > 63 else None,
            "ret_ytd": round((last / float(this_year_start) - 1) * 100, 1),
            "pct_off_52w_high": round((last / float(s.tail(252).max()) - 1) * 100, 1),
        }
        # Multi-factor: P/E, FCF yield, ROIC, market cap — from yfinance Ticker.info
        # Per /idea-generation skill: Value (P/E, FCF yield), Quality (ROIC), Size (market cap)
        try:
            info = yf.Ticker(t).info or {}
            pe = info.get("trailingPE") or info.get("forwardPE")
            mcap = info.get("marketCap")
            fcf = info.get("freeCashflow")
            if pe is not None:
                entry["pe_ttm"] = round(float(pe), 1)
            if mcap is not None:
                entry["market_cap_b"] = round(float(mcap) / 1e9, 1)
            if fcf is not None and mcap is not None and mcap > 0:
                entry["fcf_yield_pct"] = round(float(fcf) / float(mcap) * 100, 2)
            roe = info.get("returnOnEquity")
            if roe is not None:
                entry["roe_pct"] = round(float(roe) * 100, 1)
        except Exception:
            pass
        out[t] = entry
    return out


def load_prior_scan() -> dict:
    """Load the prior week's scan results — keyed by ticker → previous thesis_fit_score."""
    prior_path = OUT_DIR / "latest-thesis-fit.json"
    if not prior_path.exists():
        return {}
    try:
        data = json.loads(prior_path.read_text())
    except Exception:
        return {}
    out = {}
    for c in data.get("candidates", []):
        if c.get("ticker") and isinstance(c.get("thesis_fit_score"), (int, float)):
            out[c["ticker"]] = c["thesis_fit_score"]
    return out


def build_prompt(thesis: str, holdings: list[dict], rules: dict, returns: dict) -> tuple[str, str]:
    held = {h["ticker"]: h for h in holdings}
    def fmt_pct(v):
        return f"{v:+6.1f}%" if isinstance(v, (int, float)) else "   n/a"

    def fmt_num(v, prec=1):
        return f"{v:>6.{prec}f}" if isinstance(v, (int, float)) else "   n/a"

    universe_lines = []
    for t in CANDIDATE_UNIVERSE:
        r = returns.get(t)
        if not r:
            continue
        held_marker = " [HELD]" if t in held else ""
        # Per /idea-generation skill: surface multi-factor context per row (Value/Quality/Size).
        line = (
            f"  {t:6}{held_marker:7} ${r['price']:>8.2f}  "
            f"1mo {fmt_pct(r.get('ret_1mo'))}  3mo {fmt_pct(r.get('ret_3mo'))}  YTD {fmt_pct(r.get('ret_ytd'))}  "
            f"off 52w {fmt_pct(r.get('pct_off_52w_high'))}  "
            f"PE {fmt_num(r.get('pe_ttm'))}  FCFy {fmt_pct(r.get('fcf_yield_pct'))}  "
            f"ROE {fmt_pct(r.get('roe_pct'))}  MCap ${fmt_num(r.get('market_cap_b'))}B"
        )
        universe_lines.append(line)
    universe_block = "\n".join(universe_lines)

    # Prior-week score deltas (per /thesis-tracker: track score evolution)
    prior_scores = load_prior_scan()
    prior_block = (
        "\n".join(f"  {t}: prior score {s}/10" for t, s in prior_scores.items())
        if prior_scores
        else "  (no prior scan available)"
    )

    holdings_lines = []
    for h in holdings:
        cap = "n/a"
        if h["ticker"] == "AMZN":
            cap = f"{rules['amzn_cap_pct']}% (AMZN-specific)"
        elif h.get("expense_ratio") is None:
            cap = f"{rules['single_name_cap_pct']}% (single-name)"
        else:
            cap = f"{rules['max_position_pct']}% (portfolio)"
        holdings_lines.append(
            f"  {h['ticker']:6} target {h['target_pct']:>3}%  cap {cap:25}  function: {h['function']}"
        )
    holdings_block = "\n".join(holdings_lines)

    system = f"""You are Minho's personal wealth manager. You generate weekly "thesis-fit" candidates — names outside his current portfolio that align with his written thesis, plus structural recommendations on his existing holdings.

You do not give buy/sell recommendations. You produce structured JSON only.

You will receive multi-factor data for each candidate (Value: P/E, FCF yield; Quality: ROE; Size: market cap) alongside returns. Use these factors when scoring — a great thesis fit at extreme valuation deserves a lower score than the same name at a reasonable price.

You will also receive the prior week's scores (when available). For any candidate that appears in both this week's and last week's output, populate `score_delta` (positive = improving, negative = deteriorating) and reference what changed in the rationale.

================================
PORTFOLIO THESIS (canonical)
================================
{thesis}

================================
CURRENT HOLDINGS
================================
{holdings_block}

Discipline rules: max position {rules['max_position_pct']}%; AMZN cap {rules['amzn_cap_pct']}%; single-name cap {rules['single_name_cap_pct']}%; ±{rules['drift_threshold_pct']}% drift threshold; Roth contribution target ${rules['roth_contribution_target']}/yr.

================================
OUTPUT SCHEMA
================================
Return a JSON object inside one ```json``` block:

{{
  "summary": "2–3 sentence overview of this week's strongest thesis-fit ideas + structural notes",
  "candidates": [
    {{
      "ticker": "...",
      "name": "...",
      "thesis_fit_score": 1-10,
      "score_delta": <number or null — change vs prior week's score; null if no prior scan>,
      "factor_scores": {{
        "value": 1-10,    // P/E + FCF yield vs peers
        "quality": 1-10,  // ROE, margin stability
        "momentum": 1-10  // 1mo/3mo returns + 52w hi proximity
      }},
      "portfolio_role": "base index" | "AI compute conviction" | "factor satellite" | "hedge" | "thematic" | "international",
      "rationale": "Specific thesis clauses this addresses (quote them). Why now? If score_delta is non-zero, what changed.",
      "anti_thesis_risks": "Per /thesis-tracker: what would make this wrong. Be specific and falsifiable.",
      "size_suggestion_pct": <target weight % within discipline rules>,
      "recommended_action": "watch" | "consider" | "not_now",
      "funded_by": "new contributions" | "trim of {{ticker}}" | "none"
    }},
    ... up to 5 items, ranked by thesis_fit_score desc
  ],
  "adjacent": [
    {{
      "anchor": "NVDA",
      "candidate": "AMD",
      "thesis_fit_score": 1-10,
      "note": "How AMD adjacency works for the AI compute thesis"
    }},
    ... up to 4, one per high-conviction position where there's a meaningful adjacent name
  ],
  "etf_replacements": [
    {{
      "holding": "EWY",
      "alternative": "FLKR",
      "current_er_pct": 0.59,
      "alt_er_pct": 0.09,
      "annual_saving_estimate_usd": <on the current position value>,
      "tracking_error_note": "CRITICAL: Do NOT recommend swap based on ER alone. If the candidate tracks a different index, the gross index return differential may exceed the ER savings. Note the index methodology for each fund. The dashboard will fetch actual 5-year return data to compute net differential."
    }},
    ... up to 3 where applicable. Mark any pair where the candidate tracks a DIFFERENT index from the incumbent.
  ],
  "consolidation": [
    {{
      "proposal": "Collapse VTI + AVUS + AVUV into AVGE",
      "rationale": "...",
      "trade_offs": "..."
    }},
    ... 0–2 where applicable
  ]
}}

================================
RULES
================================
- Every rationale must quote at least one specific clause from the thesis.
- Score 1-10 calibrated: 9-10 = textbook thesis fit; 7-8 = strong fit with caveats; 5-6 = adjacent or partial; <5 = don't recommend.
- Respect Minho's discipline rules. size_suggestion_pct must be ≤ the applicable cap.
- If recommending a name that overlaps a holding (e.g., AMD overlapping NVDA), call this out and note concentration impact.
- Use web_search to fill gaps on names without recent data in the candidate universe, OR to surface a thesis-fit name not in the universe (mark it clearly in the rationale).
- "funded_by" should respect the no-selling-on-volatility rule — prefer new contributions unless there's a specific drift case."""

    user = f"""Candidate universe (sorted by ticker; multi-factor: returns + valuation + quality + size):

{universe_block}

Prior week's scores (use for score_delta + change rationale):
{prior_block}

Generate this week's thesis-fit JSON. Prioritize quality over quantity — 3 great candidates beats 5 mediocre ones. Use the multi-factor data to penalize candidates at extreme valuations even when momentum is strong."""

    return system, user


def parse_json(text: str) -> dict:
    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    raw = m.group(1) if m else (re.search(r"\{[\s\S]*\}", text) or [None])[0]
    if not raw:
        raise ValueError(f"No JSON in response: {text[:300]}")
    return json.loads(raw)


def render(data: dict) -> str:
    today = date.today().isoformat()
    lines = [
        f"# Thesis-Fit Scan — {today}",
        "",
        f"_Generated by thesis_fit.py · weekly run_",
        "",
        f"**Summary:** {data.get('summary', '—')}",
        "",
    ]

    cands = data.get("candidates", [])
    if cands:
        lines += ["## Top Candidates", ""]
        for c in cands:
            action = c.get("recommended_action", "watch").upper().replace("_", " ")
            delta = c.get("score_delta")
            delta_str = ""
            if isinstance(delta, (int, float)) and delta != 0:
                arrow = "↑" if delta > 0 else "↓"
                delta_str = f" ({arrow}{abs(delta)} vs last week)"
            factor_scores = c.get("factor_scores", {}) or {}
            factor_str = ""
            if factor_scores:
                factor_str = f" · factors: value {factor_scores.get('value','?')}/10 · quality {factor_scores.get('quality','?')}/10 · momentum {factor_scores.get('momentum','?')}/10"
            lines += [
                f"### {c.get('ticker','?')} · score {c.get('thesis_fit_score','?')}/10{delta_str} · {action}",
                f"_{c.get('name','')} · role: {c.get('portfolio_role','—')} · suggested size: {c.get('size_suggestion_pct','?')}%{factor_str}_",
                "",
                f"**Why:** {c.get('rationale', '')}",
                "",
                f"**Anti-thesis risks:** {c.get('anti_thesis_risks', c.get('risks', ''))}",
                "",
                f"**Funding:** {c.get('funded_by', 'new contributions')}",
                "",
            ]

    adj = data.get("adjacent", [])
    if adj:
        lines += ["## Adjacent to Conviction", ""]
        for a in adj:
            lines += [
                f"### {a.get('candidate','?')} (adjacent to your {a.get('anchor','?')}) · score {a.get('thesis_fit_score','?')}/10",
                f"{a.get('note', '')}",
                "",
            ]

    repl = data.get("etf_replacements", [])
    if repl:
        lines += ["## ETF Replacement Analysis", ""]
        lines += [
            "_Note: ER comparison alone is insufficient when candidates track different indexes._",
            "_Dashboard enriches these with 5-year gross return data via /api/etf-comparison._",
            "",
        ]
        for r in repl:
            saving = r.get("annual_saving_estimate_usd")
            saving_str = f"~${saving:.0f}/yr" if isinstance(saving, (int, float)) else "-"
            lines += [
                f"### {r.get('holding','?')} -> {r.get('alternative','?')}",
                f"ER {r.get('current_er_pct','?')}% -> {r.get('alt_er_pct','?')}% - est. ER savings {saving_str}",
                "",
                r.get("tracking_error_note", ""),
                "",
            ]

    cons = data.get("consolidation", [])
    if cons:
        lines += ["## Consolidation Candidates", ""]
        for c in cons:
            lines += [
                f"### {c.get('proposal','?')}",
                f"**Rationale:** {c.get('rationale', '')}",
                "",
                f"**Trade-offs:** {c.get('trade_offs', '')}",
                "",
            ]

    return "\n".join(lines) + "\n"


def main():
    dry_run = "--dry-run" in sys.argv
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    cfg = yaml.safe_load(HOLDINGS.read_text())
    holdings = cfg["holdings"]
    rules = cfg["portfolio_rules"]
    thesis = THESIS.read_text()

    # Filter out declined tickers from candidate universe
    declined = load_declined_tickers()
    universe = [t for t in CANDIDATE_UNIVERSE if t not in declined]
    if declined:
        print(f"Excluded {len(declined)} declined ticker(s): {', '.join(sorted(declined))}", file=sys.stderr)

    print("Fetching returns for candidate universe…", file=sys.stderr)
    t0 = time.time()
    returns = fetch_returns(universe)
    print(f"  got {len(returns)} tickers in {time.time()-t0:.1f}s", file=sys.stderr)

    system, user = build_prompt(thesis, holdings, rules, returns)

    print("Calling Claude…", file=sys.stderr)
    client = Anthropic()
    # NOTE: no cache_control on the system block — this script makes exactly one Claude
    # call per run, so caching just pays the 1.25x write premium without ever reading.
    # Per claude-api skill: caching is for repeat-reads within the TTL window.
    resp = client.messages.create(
        model=MODEL,
        max_tokens=6000,
        system=system,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 4}],
        messages=[{"role": "user", "content": user}],
    )
    text = "\n".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    data = parse_json(text)
    md = render(data)

    if dry_run:
        print(md)
        return

    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / f"{date.today().isoformat()}-thesis-fit.md"
    out.write_text(md)
    (OUT_DIR / "latest-thesis-fit.json").write_text(json.dumps(data, indent=2))
    print(f"Wrote {out}", file=sys.stderr)
    print(f"      {OUT_DIR / 'latest-thesis-fit.json'} (for API consumption)", file=sys.stderr)


if __name__ == "__main__":
    main()
