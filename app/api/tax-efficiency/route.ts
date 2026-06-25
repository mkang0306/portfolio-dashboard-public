import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const dynamic = "force-dynamic";

const TAX_FILE = path.join(process.cwd(), "data", "tax-efficiency.yaml");

export async function GET() {
  try {
    if (!fs.existsSync(TAX_FILE)) {
      return NextResponse.json({ available: false });
    }
    const data = yaml.load(fs.readFileSync(TAX_FILE, "utf8")) as Record<string, unknown>;
    const holdings = (data.holdings ?? []) as Record<string, unknown>[];

    // Build a map keyed by ticker for easy lookup
    const byTicker: Record<string, unknown> = {};
    for (const h of holdings) {
      const ticker = h.ticker as string;
      if (ticker) byTicker[ticker] = h;
    }

    // Check for misplacements
    const alerts: { ticker: string; type: string; message: string }[] = [];
    for (const h of holdings) {
      const ticker = h.ticker as string;
      const score = h.tax_efficiency_score as number | null;
      const optimal = h.account_optimal as boolean;
      const distYield = h.distribution_yield_pct as number | undefined;
      const account = h.account as string;

      if (score !== null && score !== undefined && score <= 3) {
        alerts.push({
          ticker,
          type: "low_score",
          message: `Tax Efficiency Score ${score}/10. Immediate review required.`,
        });
      }
      if (!optimal) {
        alerts.push({
          ticker,
          type: "misplaced",
          message: `Account placement may be suboptimal. See tax-efficiency.yaml.`,
        });
      }
      if (account === "taxable" && distYield !== undefined && distYield > 4) {
        alerts.push({
          ticker,
          type: "high_distribution",
          message: `Distribution yield ${distYield}% in taxable account exceeds 4% threshold.`,
        });
      }
    }

    return NextResponse.json({
      available: true,
      holdings: byTicker,
      alerts,
      placement_rules: data.placement_rules,
      purchase_gates: data.purchase_gates,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), available: false },
      { status: 500 },
    );
  }
}
