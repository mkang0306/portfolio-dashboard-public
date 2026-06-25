import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — returns don't change intraday

function cacheKey(incumbent: string, candidate: string): string {
  return path.join(CACHE_DIR, `etf-comp-${incumbent}-${candidate}.json`);
}

export async function GET(req: NextRequest) {
  const incumbent = req.nextUrl.searchParams.get("incumbent");
  const candidate = req.nextUrl.searchParams.get("candidate");
  const positionValue = req.nextUrl.searchParams.get("position_value") ?? "1500";

  if (!incumbent || !candidate) {
    return NextResponse.json(
      { error: "Required: ?incumbent=EWY&candidate=FLKR" },
      { status: 400 },
    );
  }

  // Check cache
  const cached = cacheKey(incumbent.toUpperCase(), candidate.toUpperCase());
  if (fs.existsSync(cached)) {
    const stat = fs.statSync(cached);
    if (Date.now() - stat.mtimeMs < CACHE_TTL) {
      return NextResponse.json(JSON.parse(fs.readFileSync(cached, "utf8")));
    }
  }

  try {
    const py = spawnSync(
      path.join(process.cwd(), ".venv", "bin", "python"),
      [
        path.join(process.cwd(), "scripts", "fetch_etf_comparison.py"),
        incumbent.toUpperCase(),
        candidate.toUpperCase(),
        "--position-value",
        positionValue,
      ],
      { encoding: "utf8", timeout: 60_000 },
    );

    if (py.status !== 0) {
      return NextResponse.json(
        { error: py.stderr || "fetch_etf_comparison.py failed" },
        { status: 500 },
      );
    }

    const data = JSON.parse(py.stdout);

    // Cache the result
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify(data, null, 2));

    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
