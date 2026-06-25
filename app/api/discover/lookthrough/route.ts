import { NextResponse } from "next/server";
import { loadHoldings } from "@/lib/holdings";
import { fetchPrices } from "@/lib/prices";
import { buildPortfolio } from "@/lib/portfolio";
import { fetchLookthrough } from "@/lib/sources/lookthrough";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const { holdings, portfolio_rules } = loadHoldings();
    const prices = await fetchPrices(holdings.map((h) => h.ticker));
    const state = buildPortfolio(holdings, prices, portfolio_rules);
    const positions = state.positions.map((p) => ({ ticker: p.ticker, weight_pct: p.weight_pct }));
    const lookthrough = await fetchLookthrough(positions);
    return NextResponse.json(lookthrough);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
