import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { loadHoldings } from "@/lib/holdings";
import { fetchPrices } from "@/lib/prices";
import { buildPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_analysis.py");

function run(positions: { ticker: string; shares: number; weight_pct: number }[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT]);
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_analysis.py exited ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error("bad json")); }
    });
    proc.stdin.write(JSON.stringify({ positions }));
    proc.stdin.end();
  });
}

export async function GET() {
  try {
    const { holdings, portfolio_rules } = loadHoldings();
    const prices = await fetchPrices(holdings.map((h) => h.ticker));
    const state = buildPortfolio(holdings, prices, portfolio_rules);
    const positions = state.positions.map((p) => ({ ticker: p.ticker, shares: p.shares, weight_pct: p.weight_pct }));
    const data = await run(positions);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
