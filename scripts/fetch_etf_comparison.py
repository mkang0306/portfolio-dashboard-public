#!/usr/bin/env python3
"""Fetch ETF comparison data for replacement candidate analysis.

Compares two ETFs on gross index returns, not just expense ratios.
Lesson from EWY/FLKR post-mortem: pure ER comparison is insufficient
when candidates track different indexes.

Usage:
  python scripts/fetch_etf_comparison.py EWY FLKR
  python scripts/fetch_etf_comparison.py EWY FLKR --position-value 1500

Output: JSON with net returns, gross index returns, net differential,
and SWAP/DECLINE/INVESTIGATE recommendation.
"""
from __future__ import annotations
import json
import sys
from datetime import datetime

import yfinance as yf
import pandas as pd


def fetch_comparison(incumbent: str, candidate: str, position_value: float = 1500.0) -> dict:
    """Compare two ETFs on gross index return, not just ER."""

    tickers = [incumbent, candidate]
    result = {
        "incumbent": incumbent,
        "candidate": candidate,
        "position_value": position_value,
    }

    # Fetch info for both
    info = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            i = tk.info or {}
            info[t] = {
                "name": i.get("longName") or i.get("shortName") or t,
                "expense_ratio": None,
                "aum_b": None,
                "category": i.get("category"),
                "benchmark": i.get("benchmark") or i.get("category"),
            }
            # yfinance expense ratio: annualReportExpenseRatio or fundProfile
            er = i.get("annualReportExpenseRatio")
            if er is None:
                er = i.get("netExpenseRatio")
            if er is not None:
                # yfinance returns ER as percentage already (0.59 = 0.59%)
                info[t]["expense_ratio"] = round(float(er), 4)
            aum = i.get("totalAssets")
            if aum is not None:
                info[t]["aum_b"] = round(float(aum) / 1e9, 2)
        except Exception as e:
            info[t] = {"name": t, "expense_ratio": None, "aum_b": None, "error": str(e)}

    result["incumbent_info"] = info[incumbent]
    result["candidate_info"] = info[candidate]

    # Fetch 5-year price history
    df = yf.download(
        tickers=tickers, period="5y", interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="column",
    )

    if df is None or df.empty:
        result["error"] = "No price data available"
        result["recommendation"] = "INVESTIGATE"
        return result

    closes = df["Close"] if len(tickers) > 1 else pd.DataFrame({tickers[0]: df["Close"]})
    closes = closes.ffill().dropna()

    returns = {}
    for t in tickers:
        if t not in closes.columns:
            continue
        s = closes[t].dropna()
        if len(s) < 252:  # Need at least 1 year
            returns[t] = {"available_days": len(s), "insufficient": True}
            continue

        years = len(s) / 252
        total_return = float(s.iloc[-1] / s.iloc[0] - 1)
        annualized = (1 + total_return) ** (1 / years) - 1

        # Volatility
        daily_ret = s.pct_change().dropna()
        vol = float(daily_ret.std() * (252 ** 0.5))

        returns[t] = {
            "available_days": len(s),
            "years": round(years, 1),
            "total_return_pct": round(total_return * 100, 2),
            "annualized_return_pct": round(annualized * 100, 2),
            "annualized_vol_pct": round(vol * 100, 2),
        }

    result["returns"] = returns

    # Compute gross index returns (net return + expense ratio)
    inc_ret = returns.get(incumbent, {})
    cand_ret = returns.get(candidate, {})

    if inc_ret.get("insufficient") or cand_ret.get("insufficient"):
        result["recommendation"] = "INVESTIGATE"
        result["recommendation_reason"] = "Insufficient price history for reliable comparison"
        return result

    inc_ann = inc_ret.get("annualized_return_pct")
    cand_ann = cand_ret.get("annualized_return_pct")

    if inc_ann is None or cand_ann is None:
        result["recommendation"] = "INVESTIGATE"
        result["recommendation_reason"] = "Missing return data"
        return result

    inc_er = info[incumbent].get("expense_ratio") or 0
    cand_er = info[candidate].get("expense_ratio") or 0

    # Gross index return = net return + expense ratio
    inc_gross = round(inc_ann + inc_er, 2)
    cand_gross = round(cand_ann + cand_er, 2)

    result["comparison"] = {
        "incumbent_er_pct": inc_er,
        "candidate_er_pct": cand_er,
        "er_savings_bps": round((inc_er - cand_er) * 100, 0),
        "incumbent_net_return_pct": inc_ann,
        "candidate_net_return_pct": cand_ann,
        "incumbent_gross_index_pct": inc_gross,
        "candidate_gross_index_pct": cand_gross,
        "gross_index_gap_bps": round((inc_gross - cand_gross) * 100, 0),
        "net_return_gap_bps": round((inc_ann - cand_ann) * 100, 0),
        "annual_er_savings_usd": round(position_value * (inc_er - cand_er) / 100, 2),
        "annual_return_loss_usd": round(position_value * (inc_ann - cand_ann) / 100, 2),
        "net_annual_impact_usd": round(
            position_value * (cand_ann - inc_ann) / 100 + position_value * (inc_er - cand_er) / 100, 2
        ),
    }

    # Correlation
    if incumbent in closes.columns and candidate in closes.columns:
        corr = float(closes[incumbent].pct_change().dropna().corr(
            closes[candidate].pct_change().dropna()
        ))
        result["comparison"]["correlation"] = round(corr, 3)

    # Recommendation: SWAP if net annual impact > 0 by > 25 bps
    # DECLINE if incumbent favored by > 25 bps; INVESTIGATE if within band
    net_gap = result["comparison"]["net_return_gap_bps"]  # positive = incumbent better
    if net_gap > 25:
        result["recommendation"] = "DECLINE"
        result["recommendation_reason"] = (
            f"Incumbent {incumbent} outperforms by {net_gap:.0f} bps/yr net. "
            f"ER savings of {result['comparison']['er_savings_bps']:.0f} bps do not offset "
            f"the {result['comparison']['gross_index_gap_bps']:.0f} bps gross index advantage."
        )
    elif net_gap < -25:
        result["recommendation"] = "SWAP"
        result["recommendation_reason"] = (
            f"Candidate {candidate} outperforms by {abs(net_gap):.0f} bps/yr net. "
            f"Both lower ER and better/comparable index tracking favor the switch."
        )
    else:
        result["recommendation"] = "INVESTIGATE"
        result["recommendation_reason"] = (
            f"Net return gap is only {abs(net_gap):.0f} bps, within the +/-25 bps noise band. "
            f"Consider AUM/liquidity ({info[incumbent].get('aum_b', '?')}B vs {info[candidate].get('aum_b', '?')}B), "
            f"wash-sale implications, and index methodology differences before deciding."
        )

    return result


def main():
    if len(sys.argv) < 3:
        print("Usage: fetch_etf_comparison.py INCUMBENT CANDIDATE [--position-value N]", file=sys.stderr)
        sys.exit(1)

    incumbent = sys.argv[1].upper()
    candidate = sys.argv[2].upper()
    position_value = 1500.0

    if "--position-value" in sys.argv:
        idx = sys.argv.index("--position-value")
        position_value = float(sys.argv[idx + 1])

    result = fetch_comparison(incumbent, candidate, position_value)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
