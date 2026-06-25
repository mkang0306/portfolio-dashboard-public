import { spawn } from "node:child_process";
import path from "node:path";

export interface ScreenerRow {
  price: number | null;
  returns: Partial<Record<"1d" | "5d" | "1mo" | "3mo" | "1y" | "ytd", number>>;
  high_52w: number | null;
  low_52w: number | null;
  pct_off_high: number | null;
}
export type ScreenerResult = Record<string, ScreenerRow>;

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_screener.py");

export function fetchScreener(tickers: string[]): Promise<ScreenerResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, ...tickers]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_screener.py exited ${code}: ${err}`));
      try {
        resolve(JSON.parse(out) as ScreenerResult);
      } catch {
        reject(new Error(`bad JSON from fetch_screener.py: ${out.slice(0, 200)}`));
      }
    });
  });
}
