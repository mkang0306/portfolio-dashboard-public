import { NextResponse } from "next/server";
import { loadDividends, loadCashflows } from "@/lib/transactions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dividends = loadDividends();
    const cashflows = loadCashflows();

    // Aggregate dividends by ticker (YTD)
    const thisYear = new Date().getFullYear();
    const ytdDivs = dividends.filter((d) => d.date.startsWith(`${thisYear}`));
    const byTicker = new Map<string, { total: number; count: number; last: string }>();
    for (const d of ytdDivs) {
      const cur = byTicker.get(d.ticker) ?? { total: 0, count: 0, last: d.date };
      cur.total += d.amount;
      cur.count += 1;
      if (d.date > cur.last) cur.last = d.date;
      byTicker.set(d.ticker, cur);
    }
    const dividendsByTicker = Array.from(byTicker.entries())
      .map(([ticker, v]) => ({ ticker, ...v }))
      .sort((a, b) => b.total - a.total);

    // Roth contributions
    const rothYtd = cashflows
      .filter((c) => c.type === "ITRF" && c.date.startsWith(`${thisYear}`))
      .reduce((s, c) => s + Math.abs(c.amount), 0);

    // ACH net flows
    const achNet = cashflows
      .filter((c) => c.type === "ACH" && c.date.startsWith(`${thisYear}`))
      .reduce((s, c) => s + c.amount, 0);

    // Interest + bonuses YTD
    const interestYtd = cashflows
      .filter((c) => ["INT", "GDBP", "GMPC"].includes(c.type) && c.date.startsWith(`${thisYear}`))
      .reduce((s, c) => s + c.amount, 0);

    return NextResponse.json({
      year: thisYear,
      dividends_ytd_total: ytdDivs.reduce((s, d) => s + d.amount, 0),
      dividends_by_ticker: dividendsByTicker,
      dividends_recent: ytdDivs.slice(0, 12),
      roth_contributions_ytd: rothYtd,
      roth_contribution_limit: 7500,
      ach_net_ytd: achNet,
      interest_ytd: interestYtd,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
