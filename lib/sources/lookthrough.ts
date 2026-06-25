import { spawn } from "node:child_process";
import path from "node:path";

export interface Underlying {
  ticker: string;
  name: string;
  total: number; // % of portfolio
  contributions: { from: string; weight: number }[];
}

export interface LookthroughResult {
  underlyings: Underlying[];
  sectors: Record<string, number>;       // % of portfolio
  benchmark: string;
  benchmark_sectors: Record<string, number>;
}

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_lookthrough.py");

export function fetchLookthrough(
  positions: { ticker: string; weight_pct: number }[],
): Promise<LookthroughResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_lookthrough.py exited ${code}: ${err}`));
      try {
        resolve(JSON.parse(out) as LookthroughResult);
      } catch {
        reject(new Error(`bad JSON from fetch_lookthrough.py: ${out.slice(0, 200)}`));
      }
    });
    proc.stdin.write(JSON.stringify({ positions }));
    proc.stdin.end();
  });
}
