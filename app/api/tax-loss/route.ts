import { NextResponse } from "next/server";
import { loadHoldings } from "@/lib/holdings";
import { fetchPrices } from "@/lib/prices";
import { buildPortfolio } from "@/lib/portfolio";
import { loadTransactions } from "@/lib/transactions";
import { buildHarvestOpportunities, computeRealizedYtd } from "@/lib/tax_loss";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { holdings, portfolio_rules } = loadHoldings();
    const prices = await fetchPrices(holdings.map((h) => h.ticker));
    const state = buildPortfolio(holdings, prices, portfolio_rules);
    const transactions = loadTransactions();
    const opportunities = buildHarvestOpportunities(state.positions, transactions);
    const ledger = computeRealizedYtd(transactions);
    return NextResponse.json({ opportunities, ledger });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
