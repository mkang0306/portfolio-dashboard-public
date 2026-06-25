import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const PY = path.join(process.cwd(), ".venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "fetch_macro.py");

interface MacroEntry { label: string; level?: number; change_1d_pct?: number; change_1mo_pct?: number; error?: string }

function run(): Promise<Record<string, MacroEntry>> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT]);
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fetch_macro.py exited ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error("bad json")); }
    });
  });
}

export async function GET() {
  try {
    return NextResponse.json(await run());
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
