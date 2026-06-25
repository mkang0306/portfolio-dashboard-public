#!/usr/bin/env python3
"""Parse Robinhood account activity CSV into structured YAML files.

Inputs:  data/robinhood_activity.csv (export from robinhood.com → Reports)
Outputs:
  data/transactions.yaml   (Buy/Sell rows: ticker, date, shares, price, action)
  data/dividends.yaml      (CDIV rows: ticker, date, amount, ex_date, pay_date, shares, per_share)
  data/cashflows.yaml      (ACH, ITRF rows: date, amount, type, description)

Usage: parse_robinhood_csv.py
"""
from __future__ import annotations
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Install pyyaml first: .venv/bin/pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "robinhood_activity.csv"
DATA_DIR = ROOT / "data"


def parse_date(s: str) -> str:
    return datetime.strptime(s, "%m/%d/%Y").date().isoformat()


def parse_money(s: str) -> float:
    """Parse '$1,234.56' or '($1,234.56)' to float."""
    s = (s or "").strip()
    if not s:
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    s = s.replace("$", "").replace(",", "")
    if not s:
        return 0.0
    v = float(s)
    return -v if neg else v


def parse_qty(s: str) -> float:
    s = (s or "").replace(",", "").strip()
    return float(s) if s else 0.0


def parse_div_desc(desc: str) -> dict:
    """Parse 'Cash Div: R/D 2026-05-11 P/D 2026-05-14 - 4 shares at 0.27' into structured fields."""
    out: dict = {}
    m = re.search(r"R/D\s+(\S+)\s+P/D\s+(\S+)\s+-\s+([\d.]+)\s+shares\s+at\s+([\d.]+)", desc)
    if m:
        out["ex_date"] = m.group(1)
        out["pay_date"] = m.group(2)
        out["shares_at_record"] = float(m.group(3))
        out["per_share"] = float(m.group(4))
    return out


def main():
    if not CSV_PATH.exists():
        print(f"CSV not found at {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    transactions = []
    dividends = []
    cashflows = []

    with CSV_PATH.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("Trans Code") or "").strip()
            ticker = (row.get("Instrument") or "").strip()
            desc = (row.get("Description") or "").strip()
            date_str = (row.get("Activity Date") or "").strip()
            if not date_str or not code:
                continue
            try:
                date = parse_date(date_str)
            except ValueError:
                continue
            amount = parse_money(row.get("Amount", ""))
            qty = parse_qty(row.get("Quantity", ""))
            price = parse_money(row.get("Price", ""))

            if code in ("Buy", "Sell"):
                is_drip = "Dividend Reinvestment" in desc
                transactions.append({
                    "date": date,
                    "ticker": ticker,
                    "action": code.lower(),
                    "shares": qty,
                    "price": price,
                    "amount": amount,
                    "drip": is_drip,
                })
            elif code == "CDIV":
                div_meta = parse_div_desc(desc)
                dividends.append({
                    "date": date,
                    "ticker": ticker,
                    "amount": amount,
                    **div_meta,
                })
            elif code in ("ACH", "ITRF", "INT", "GDBP", "GMPC", "GOLD"):
                cashflows.append({
                    "date": date,
                    "type": code,
                    "amount": amount,
                    "description": desc,
                })

    # Sort newest first
    transactions.sort(key=lambda x: x["date"], reverse=True)
    dividends.sort(key=lambda x: x["date"], reverse=True)
    cashflows.sort(key=lambda x: x["date"], reverse=True)

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "transactions.yaml").write_text(yaml.safe_dump({"transactions": transactions}, sort_keys=False))
    (DATA_DIR / "dividends.yaml").write_text(yaml.safe_dump({"dividends": dividends}, sort_keys=False))
    (DATA_DIR / "cashflows.yaml").write_text(yaml.safe_dump({"cashflows": cashflows}, sort_keys=False))

    # Summary
    print(f"Wrote {len(transactions)} transactions, {len(dividends)} dividends, {len(cashflows)} cashflows")
    print(f"  Total dividends: ${sum(d['amount'] for d in dividends):.2f}")
    print(f"  Net cash flow:   ${sum(c['amount'] for c in cashflows):+,.2f}")
    print(f"  Roth contributions YTD: ${sum(-c['amount'] for c in cashflows if c['type'] == 'ITRF'):.2f}")
    # Closed positions
    held = {t["ticker"] for t in transactions}
    sold = {t["ticker"] for t in transactions if t["action"] == "sell"}
    bought = {t["ticker"] for t in transactions if t["action"] == "buy"}
    closed = sold - bought
    print(f"  Closed positions (sold but not bought in window): {sorted(closed)}")


if __name__ == "__main__":
    main()
