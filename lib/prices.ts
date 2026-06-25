import { spawn } from "node:child_process";
import path from "node:path";

export interface PriceQuote {
  price: number | null;
  prev_close: number | null;
  currency: string;
}
export type PriceMap = Record<string, PriceQuote>;

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_prices.py");

export function fetchPrices(tickers: string[]): Promise<PriceMap> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, ...tickers]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_prices.py exited ${code}: ${err}`));
      try {
        resolve(JSON.parse(out) as PriceMap);
      } catch (e) {
        reject(new Error(`bad JSON from fetch_prices.py: ${out.slice(0, 200)}`));
      }
    });
  });
}
