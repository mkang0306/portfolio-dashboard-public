import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type WatchlistStatus = "watch" | "consider" | "queue" | "declined";

export interface WatchlistItem {
  ticker: string;
  added: string;
  status: WatchlistStatus;
  note: string;
  buy_if: string | null;
  revisit_by: string | null;
  target_size_pct: number | null;
  tags: string[];
}

export interface JournalEntry {
  date: string;
  ticker: string | null;
  tags: string[];
  body: string;
}

const DATA = path.join(process.cwd(), "data");

function readYaml<T>(file: string, key: string): T[] {
  const fullPath = path.join(DATA, file);
  if (!fs.existsSync(fullPath)) return [];
  const blob = yaml.load(fs.readFileSync(fullPath, "utf8")) as Record<string, T[]>;
  return blob[key] ?? [];
}

function writeYaml(file: string, key: string, data: unknown[]): void {
  const fullPath = path.join(DATA, file);
  // Read existing file to preserve comments at the top
  let header = "";
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    const commentLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("#") || line.trim() === "") {
        commentLines.push(line);
      } else {
        break;
      }
    }
    header = commentLines.join("\n") + "\n";
  }
  const body = yaml.dump({ [key]: data }, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  fs.writeFileSync(fullPath, header + body, "utf8");
}

export function loadWatchlist(): WatchlistItem[] {
  return readYaml<WatchlistItem>("watchlist.yaml", "watchlist");
}

export function saveWatchlist(items: WatchlistItem[]): void {
  writeYaml("watchlist.yaml", "watchlist", items);
}

export function loadJournal(): JournalEntry[] {
  return readYaml<JournalEntry>("journal.yaml", "entries");
}

export function saveJournal(entries: JournalEntry[]): void {
  writeYaml("journal.yaml", "entries", entries);
}

export interface DeclinedItem {
  ticker: string;
  date: string;
  reason: string;
}

export function loadDeclined(): DeclinedItem[] {
  return readYaml<DeclinedItem>("declined.yaml", "declined");
}

export function saveDeclined(items: DeclinedItem[]): void {
  writeYaml("declined.yaml", "declined", items);
}

export function declinedTickers(): Set<string> {
  return new Set(loadDeclined().map((d) => d.ticker));
}
