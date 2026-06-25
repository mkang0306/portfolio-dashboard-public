"use client";
import type { Position, SellTrigger, StructuredSellTrigger } from "@/lib/portfolio";

type TriggerType = "thesis_break" | "drift" | "opportunity";

const TYPE_STYLE: Record<TriggerType, { label: string; color: string }> = {
  thesis_break: { label: "Thesis Break", color: "text-[color:var(--bad)]" },
  drift: { label: "Drift", color: "text-[color:var(--warn)]" },
  opportunity: { label: "Opportunity Cost", color: "text-[color:var(--accent)]" },
};

function isStructured(t: SellTrigger): t is StructuredSellTrigger {
  return typeof t === "object" && t !== null && "type" in t && "condition" in t;
}

function groupTriggers(triggers: SellTrigger[]): Record<TriggerType, string[]> {
  const groups: Record<TriggerType, string[]> = {
    thesis_break: [],
    drift: [],
    opportunity: [],
  };
  for (const t of triggers) {
    if (isStructured(t)) {
      const type = t.type as TriggerType;
      if (groups[type]) groups[type].push(t.condition);
      else groups.thesis_break.push(t.condition);
    } else {
      // Legacy string trigger, treat as thesis_break
      groups.thesis_break.push(t);
    }
  }
  return groups;
}

export default function TriggerStatus({ positions }: { positions: Position[] }) {
  const withTriggers = positions.filter((p) => p.sell_triggers && p.sell_triggers.length > 0);
  const missing = positions.filter((p) => !p.sell_triggers || p.sell_triggers.length === 0);
  const firedTriggers = positions.flatMap((p) =>
    p.sell_triggers.filter((t): t is StructuredSellTrigger => isStructured(t) && t.fired === true)
      .map((t) => ({ ticker: p.ticker, ...t }))
  );

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Sell Triggers</h3>
        <span className={`text-[10px] uppercase tracking-wider ${
          missing.length > 0 ? "text-[color:var(--warn)]" : "text-[color:var(--good)]"
        }`}>
          {withTriggers.length}/{positions.length} defined
        </span>
      </div>

      {/* Fired triggers alert */}
      {firedTriggers.length > 0 && (
        <div className="mb-4 rounded-lg border border-[color:var(--bad)]/30 bg-[color:var(--bad-soft)] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--bad)]">
            Triggered: Requires Review
          </p>
          <ul className="mt-2 space-y-1">
            {firedTriggers.map((t, i) => (
              <li key={i} className="text-xs text-[color:var(--bad)]">
                <span className="font-mono font-semibold">{t.ticker}</span>: {t.condition}
                {t.fired_date && <span className="ml-2 text-[color:var(--text-faint)]">({t.fired_date})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing triggers nag */}
      {missing.length > 0 && (
        <div className="mb-4 rounded-lg border border-[color:var(--warn)]/30 bg-[color:var(--warn-soft)] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--warn)]">
            Missing Sell Triggers
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-dim)]">
            {missing.length} position{missing.length === 1 ? "" : "s"} without written sell criteria.
            Motivated reasoning gets harder to fight without pre-committed exit conditions.
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-[color:var(--warn)]">
            {missing.map((p) => p.ticker).join(", ")}
          </p>
          <p className="mt-2 text-[10px] text-[color:var(--text-faint)]">
            Edit <code className="text-[color:var(--text-dim)]">data/holdings.yaml</code> to add structured triggers.
          </p>
        </div>
      )}

      {/* Defined triggers by position, grouped by type */}
      {withTriggers.length > 0 && (
        <ul className="space-y-4 text-xs">
          {withTriggers.map((p) => {
            const groups = groupTriggers(p.sell_triggers);
            return (
              <li key={p.ticker}>
                <p className="font-mono text-[11px] font-semibold text-white">{p.ticker}</p>
                <div className="mt-1.5 space-y-2 pl-1">
                  {(Object.entries(groups) as [TriggerType, string[]][]).map(([type, conditions]) =>
                    conditions.length > 0 ? (
                      <div key={type}>
                        <p className={`text-[9px] uppercase tracking-wider ${TYPE_STYLE[type].color}`}>
                          {TYPE_STYLE[type].label}
                        </p>
                        <ul className="mt-0.5 space-y-0.5 pl-2">
                          {conditions.map((c, i) => (
                            <li key={i} className="leading-relaxed text-[color:var(--text-dim)] before:mr-2 before:text-[color:var(--text-faint)] before:content-['-']">
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
