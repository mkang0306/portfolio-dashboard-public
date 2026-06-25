"use client";
import type { Position } from "@/lib/portfolio";

const MAG7 = new Set(["AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT"]);

interface Meter {
  label: string;
  pct: number;
  target: number | null; // soft ceiling for visual scale
  note?: string;
}

export default function ConcentrationMeter({ positions, bare }: { positions: Position[]; bare?: boolean }) {
  const total = positions.reduce((s, p) => s + p.value, 0);
  const sumOf = (filter: (p: Position) => boolean) =>
    (positions.filter(filter).reduce((s, p) => s + p.value, 0) / total) * 100;

  // Direct Mag 7 (not look-through yet)
  const mag7Direct = sumOf((p) => MAG7.has(p.ticker));
  // AI compute thematic (Mag 7 + DRAM)
  const aiCompute = sumOf((p) => MAG7.has(p.ticker) || p.ticker === "DRAM");
  // US home bias
  const us = sumOf((p) => !["VXUS", "EWY", "GLD"].includes(p.ticker));
  // Single-stock
  const single = sumOf((p) => p.expense_ratio === null);

  const meters: Meter[] = [
    { label: "Mag 7 direct", pct: mag7Direct, target: 40, note: "thesis budgets ~40% effective Mag 7" },
    { label: "AI compute (incl. DRAM)", pct: aiCompute, target: 48, note: "thesis budgets ~48%" },
    { label: "US (vs international)", pct: us, target: 75, note: "thesis accepts ~75% US bias" },
    { label: "Single stocks", pct: single, target: null, note: "individual names, excludes ETFs" },
  ];

  return (
    <div className={bare ? "p-5" : "card p-5"}>
      {!bare && <h3 className="mb-4 text-sm font-semibold text-white">Concentration</h3>}
      <ul className="space-y-3">
        {meters.map((m) => {
          const overTarget = m.target !== null && m.pct > m.target;
          const fillPct = Math.min(100, (m.pct / (m.target ?? 100)) * 100);
          return (
            <li key={m.label}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-[color:var(--text)]">{m.label}</span>
                <span className={`num font-medium ${overTarget ? "text-[color:var(--warn)]" : "text-[color:var(--text)]"}`}>
                  {m.pct.toFixed(1)}%
                  {m.target !== null && (
                    <span className="ml-1 text-[color:var(--text-faint)]">/ {m.target}%</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-elev-2)]">
                <div
                  className={`h-full rounded-full transition-all ${overTarget ? "bg-[color:var(--warn)]" : "bg-[color:var(--accent)]"}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              {m.note && <p className="mt-1 text-[10px] text-[color:var(--text-faint)]">{m.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
