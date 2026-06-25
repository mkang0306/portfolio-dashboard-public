"use client";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Position } from "@/lib/portfolio";
import { categoryFor, SCHEME_LABELS, type CategoryScheme } from "@/lib/categories";

interface Slice {
  name: string;
  value: number;
  color: string;
  pct: number;
}

export default function AllocationChart({ positions, bare }: { positions: Position[]; bare?: boolean }) {
  const [scheme, setScheme] = useState<CategoryScheme>("thesis");
  const total = positions.reduce((s, p) => s + p.value, 0);

  // Group by category for chosen scheme
  const grouped = new Map<string, { value: number; color: string; tickers: string[] }>();
  for (const p of positions) {
    if (p.value <= 0) continue;
    const cat = categoryFor(p, scheme);
    const prev = grouped.get(cat.label) ?? { value: 0, color: cat.color, tickers: [] };
    prev.value += p.value;
    prev.tickers.push(p.ticker);
    grouped.set(cat.label, prev);
  }
  const data: Slice[] = Array.from(grouped.entries())
    .map(([name, v]) => ({ name, value: Math.round(v.value), color: v.color, pct: (v.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);

  const renderLabel = (e: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string }) => {
    const RADIAN = Math.PI / 180;
    const r = e.innerRadius + (e.outerRadius - e.innerRadius) * 0.5;
    const x = e.cx + r * Math.cos(-e.midAngle * RADIAN);
    const y = e.cy + r * Math.sin(-e.midAngle * RADIAN);
    if (e.percent < 0.06) return null;
    return (
      <text x={x} y={y} fill="#0d1117" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${(e.percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className={bare ? "p-5" : "card p-5"}>
      <div className="mb-4 flex items-start justify-between">
        {!bare && <h3 className="text-sm font-semibold text-white">Allocation</h3>}
        <div className="flex gap-1">
          {(Object.keys(SCHEME_LABELS) as CategoryScheme[]).map((s) => (
            <button
              key={s}
              data-active={scheme === s}
              onClick={() => setScheme(s)}
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color:var(--accent-soft)] data-[active=true]:text-[color:var(--accent)]"
              title={SCHEME_LABELS[s]}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius={88}
              innerRadius={52}
              paddingAngle={1.5}
              label={renderLabel}
              labelLine={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} stroke="#0d1117" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e6edf3" }}
              formatter={(v: number, n: string) => [`$${v.toLocaleString()} (${((v / total) * 100).toFixed(1)}%)`, n]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-[color:var(--text)]">{d.name}</span>
            </span>
            <span className="num text-[color:var(--text-dim)]">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
