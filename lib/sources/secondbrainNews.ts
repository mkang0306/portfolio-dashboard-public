import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SecondBrainNewsItem {
  source: string;
  headline: string;
  url: string;
  summary: string;
  file: string;
}

const NEWS_DIR = path.join(os.homedir(), "Documents", "SecondBrain", "raw", "news");

/** Returns up to `maxFiles` most-recent raw news files, by mtime desc. */
function latestFiles(maxFiles = 3): string[] {
  if (!fs.existsSync(NEWS_DIR)) return [];
  return fs
    .readdirSync(NEWS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(NEWS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxFiles)
    .map((x) => path.join(NEWS_DIR, x.f));
}

/** Parse news-research output into item blocks separated by `---`. */
function parseFile(filepath: string): SecondBrainNewsItem[] {
  const text = fs.readFileSync(filepath, "utf8");
  const fileName = path.basename(filepath);
  const blocks = text.split(/\n---\n/);
  const items: SecondBrainNewsItem[] = [];
  for (const block of blocks) {
    const headerMatch = block.match(/^##\s+(.+?)\s+-\s+(.+)$/m);
    if (!headerMatch) continue;
    const source = headerMatch[1].trim();
    const headline = headerMatch[2].trim();
    const url = block.match(/\*\*URL:\*\*\s+(\S+)/)?.[1] ?? "";
    const summary = block.match(/\*\*Summary:\*\*\s+([^\n]+(?:\n(?!\*\*)[^\n]+)*)/)?.[1].trim() ?? "";
    items.push({ source, headline, url, summary, file: fileName });
  }
  return items;
}

/** Find items mentioning the ticker, name, or function keywords. Case-insensitive. */
export function findSecondBrainNews(ticker: string, name: string, keywords: string[] = []): SecondBrainNewsItem[] {
  const files = latestFiles(3);
  if (files.length === 0) return [];
  const needles = [ticker, name.split(/\s+/)[0], ...keywords]
    .filter((k) => k && k.length > 2)
    .map((k) => k.toLowerCase());
  const all = files.flatMap(parseFile);
  return all.filter((it) => {
    const blob = `${it.headline} ${it.summary}`.toLowerCase();
    return needles.some((n) => blob.includes(n));
  });
}
