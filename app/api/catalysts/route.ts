import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_catalendar.py");

interface Event {
  date: string;
  ticker: string | null;
  name: string;
  type: "earnings" | "corporate" | "industry" | "macro";
  impact: "high" | "medium" | "low";
  notes: string;
  days_away: number;
}

function run(days: number): Promise<{ events: Event[]; horizon_days: number; today: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, "--days", String(days)]);
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_catalendar.py exited ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error("bad json")); }
    });
  });
}

export async function GET(req: NextRequest) {
  try {
    const days = Math.min(180, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "60")));
    return NextResponse.json(await run(days));
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
