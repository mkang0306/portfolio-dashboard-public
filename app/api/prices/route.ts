import { NextResponse } from "next/server";
import { loadHoldings } from "@/lib/holdings";
import { fetchPrices } from "@/lib/prices";
import { buildPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { holdings, portfolio_rules } = loadHoldings();
    const prices = await fetchPrices(holdings.map((h) => h.ticker));
    const state = buildPortfolio(holdings, prices, portfolio_rules);
    return NextResponse.json({ ...state, rules: portfolio_rules });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
