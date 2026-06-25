import { spawn } from "node:child_process";
import path from "node:path";

export interface SecFiling {
  form: string;
  filed: string;
  accession: string;
  primary_doc: string;
  url: string;
}

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_sec.py");

export function fetchSecFilings(tickers: string[]): Promise<Record<string, SecFiling[]>> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, ...tickers]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_sec.py exited ${code}: ${err}`));
      try {
        const parsed = JSON.parse(out) as Record<string, { items?: SecFiling[] }>;
        const result: Record<string, SecFiling[]> = {};
        for (const [t, v] of Object.entries(parsed)) result[t] = v.items ?? [];
        resolve(result);
      } catch {
        reject(new Error(`bad JSON from fetch_sec.py: ${out.slice(0, 200)}`));
      }
    });
  });
}
