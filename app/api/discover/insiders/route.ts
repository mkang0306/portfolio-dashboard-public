import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { loadHoldings } from "@/lib/holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_insiders.py");

interface InsiderRow {
  insider: string;
  position: string;
  transaction: string;
  date: string;
  shares: number | null;
  value: number | null;
  ownership: string;
}

function run(tickers: string[]): Promise<Record<string, InsiderRow[]>> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, ...tickers]);
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_insiders.py exited ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error("bad json")); }
    });
  });
}

export async function GET() {
  try {
    const { holdings } = loadHoldings();
    // Only individual stocks have meaningful insider data; skip ETFs
    const stocks = holdings.filter((h) => h.expense_ratio === null).map((h) => h.ticker);
    const data = await run(stocks);
    // Flatten and sort by date desc
    const all: (InsiderRow & { ticker: string })[] = [];
    for (const [ticker, rows] of Object.entries(data)) {
      for (const r of rows) all.push({ ticker, ...r });
    }
    all.sort((a, b) => (b.date > a.date ? 1 : -1));
    return NextResponse.json({ rows: all });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
