import { spawn } from "node:child_process";
import path from "node:path";

export interface YahooNewsItem {
  title: string;
  publisher: string;
  link: string;
  published: string;
}

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_news.py");

export function fetchYahooNews(tickers: string[]): Promise<Record<string, YahooNewsItem[]>> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, ...tickers]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_news.py exited ${code}: ${err}`));
      try {
        const parsed = JSON.parse(out) as Record<string, { items?: YahooNewsItem[]; error?: string }>;
        const result: Record<string, YahooNewsItem[]> = {};
        for (const [t, v] of Object.entries(parsed)) result[t] = v.items ?? [];
        resolve(result);
      } catch {
        reject(new Error(`bad JSON from fetch_news.py: ${out.slice(0, 200)}`));
      }
    });
  });
}
