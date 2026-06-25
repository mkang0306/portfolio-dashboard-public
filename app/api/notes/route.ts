import { NextResponse } from "next/server";
import { loadWatchlist, loadJournal } from "@/lib/notes";
import { loadTransactions } from "@/lib/transactions";
import { loadHoldings } from "@/lib/holdings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const watchlist = loadWatchlist();
    const journal = loadJournal();

    // Compute closed positions: tickers that appear in transactions but not in current holdings.
    const transactions = loadTransactions();
    const { holdings } = loadHoldings();
    const heldSet = new Set(holdings.map((h) => h.ticker));

    interface ClosedPos {
      ticker: string;
      buys: { date: string; shares: number; price: number; amount: number }[];
      sells: { date: string; shares: number; price: number; amount: number }[];
      net_realized: number;
      last_activity: string;
    }
    const closedMap = new Map<string, ClosedPos>();
    for (const t of transactions) {
      if (t.drip) continue;
      if (heldSet.has(t.ticker)) continue; // currently held — not closed
      if (!t.ticker) continue;
      const c = closedMap.get(t.ticker) ?? {
        ticker: t.ticker,
        buys: [],
        sells: [],
        net_realized: 0,
        last_activity: t.date,
      };
      const entry = { date: t.date, shares: t.shares, price: t.price, amount: t.amount };
      if (t.action === "buy") c.buys.push(entry);
      else c.sells.push(entry);
      c.net_realized += t.amount; // amount is signed: sells positive, buys negative
      if (t.date > c.last_activity) c.last_activity = t.date;
      closedMap.set(t.ticker, c);
    }
    // Only include tickers with at least one sell in the window
    const closed = Array.from(closedMap.values())
      .filter((c) => c.sells.length > 0)
      .sort((a, b) => (b.last_activity > a.last_activity ? 1 : -1))
      .map((c) => ({
        ...c,
        net_realized: Math.round(c.net_realized * 100) / 100,
      }));

    return NextResponse.json({ watchlist, journal, closed_positions: closed });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
