import { spawn } from "node:child_process";
import path from "node:path";

export interface HistoryResult {
  timestamps: string[];
  prices: Record<string, (number | null)[]>;
}

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_history.py");

export function fetchHistory(period: string, tickers: string[]): Promise<HistoryResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, period, ...tickers]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_history.py exited ${code}: ${err}`));
      try {
        resolve(JSON.parse(out) as HistoryResult);
      } catch {
        reject(new Error(`bad JSON from fetch_history.py: ${out.slice(0, 200)}`));
      }
    });
  });
}
