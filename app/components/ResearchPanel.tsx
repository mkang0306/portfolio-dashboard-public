"use client";
import { useState } from "react";

type Classification = "confirms" | "neutral" | "contradicts" | "trigger_match";
type Action = "hold" | "trim" | "add" | "sell" | "watch_thesis_break";
type ThesisHealth = "confirmed" | "wobbling" | "threatened" | "unchanged";

interface ResearchItem {
  headline: string;
  source?: string;
  url?: string;
  classification: Classification;
  reasoning: string;
}

interface TradeIdea {
  position_type: "long" | "short" | "neutral";
  thesis: string;
  catalyst: string;
  risk: string;
}

interface ResearchResult {
  ticker: string;
  top_call?: { headline: string; action: Action; reasoning: string };
  thesis_status?: ThesisHealth;
  summary: string;
  items: ResearchItem[];
  trade_ideas?: TradeIdea[];
  sources_used?: { yahoo: number; sec: number; secondbrain: number };
}

const ITEM_COLOR: Record<Classification, string> = {
  confirms: "text-[color:var(--good)] border-[color:var(--good)]/30 bg-[color:var(--good-soft)]",
  neutral: "text-[color:var(--text-dim)] border-[color:var(--border)] bg-[color:var(--bg-elev-2)]",
  contradicts: "text-[color:var(--warn)] border-[color:var(--warn)]/30 bg-[color:var(--warn-soft)]",
  trigger_match: "text-[color:var(--bad)] border-[color:var(--bad)]/30 bg-[color:var(--bad-soft)]",
};

const ACTION_STYLE: Record<Action, { label: string; bg: string; text: string }> = {
  hold: { label: "HOLD", bg: "bg-[color:var(--bg-elev-2)]", text: "text-[color:var(--text-dim)]" },
  add: { label: "ADD", bg: "bg-[color:var(--good-soft)]", text: "text-[color:var(--good)]" },
  trim: { label: "TRIM", bg: "bg-[color:var(--warn-soft)]", text: "text-[color:var(--warn)]" },
  sell: { label: "SELL", bg: "bg-[color:var(--bad-soft)]", text: "text-[color:var(--bad)]" },
  watch_thesis_break: { label: "WATCH THESIS", bg: "bg-[color:var(--warn-soft)]", text: "text-[color:var(--warn)]" },
};

const STATUS_STYLE: Record<ThesisHealth, { label: string; color: string }> = {
  confirmed: { label: "Thesis confirmed", color: "text-[color:var(--good)]" },
  unchanged: { label: "Thesis unchanged", color: "text-[color:var(--text-dim)]" },
  wobbling: { label: "Thesis wobbling", color: "text-[color:var(--warn)]" },
  threatened: { label: "Thesis threatened", color: "text-[color:var(--bad)]" },
};

export default function ResearchPanel({
  ticker,
  onClose,
}: {
  ticker: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading && !result && !error) {
    fetch(`/api/research?ticker=${ticker}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setResult(d); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  const priority = result
    ? [...result.items].sort((a, b) => {
        const rank = { trigger_match: 0, contradicts: 1, confirms: 2, neutral: 3 };
        return rank[a.classification] - rank[b.classification];
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
      <div className="card w-full max-w-3xl p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-xl font-bold text-white">{ticker} / Morning Note</h2>
          <button
            onClick={onClose}
            className="rounded-md bg-[color:var(--bg-elev-2)] px-3 py-1 text-sm text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-white"
          >
            Close
          </button>
        </div>
        {loading && <p className="text-sm text-[color:var(--text-dim)]">Fetching news + running thesis check…</p>}
        {error && <p className="text-sm text-[color:var(--bad)]">Error: {error}</p>}
        {result && (
          <>
            {/* Top Call (morning-note headline) */}
            {result.top_call && (
              <div className="mb-5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] p-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Top Call</p>
                  <div className="flex items-center gap-2">
                    {result.thesis_status && (
                      <span className={`text-[10px] uppercase tracking-wider ${STATUS_STYLE[result.thesis_status].color}`}>
                        {STATUS_STYLE[result.thesis_status].label}
                      </span>
                    )}
                    <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-medium ${ACTION_STYLE[result.top_call.action].bg} ${ACTION_STYLE[result.top_call.action].text}`}>
                      {ACTION_STYLE[result.top_call.action].label}
                    </span>
                  </div>
                </div>
                <p className="text-base font-semibold text-white">{result.top_call.headline}</p>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-dim)]">{result.top_call.reasoning}</p>
              </div>
            )}

            {result.summary && !result.top_call && (
              <p className="mb-2 text-sm text-[color:var(--text-dim)]">{result.summary}</p>
            )}

            {result.sources_used && (
              <p className="mb-4 text-xs text-[color:var(--text-faint)]">
                Sources: Yahoo {result.sources_used.yahoo} · SEC {result.sources_used.sec} ·
                SecondBrain {result.sources_used.secondbrain} · + web search
              </p>
            )}

            {/* Trade ideas */}
            {result.trade_ideas && result.trade_ideas.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  Trade ideas
                </p>
                <ul className="space-y-2">
                  {result.trade_ideas.map((ti, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--accent)]">{ti.position_type}</p>
                      <p className="mt-1 text-sm text-white">{ti.thesis}</p>
                      <p className="mt-1.5 text-xs text-[color:var(--text-dim)]">
                        <span className="text-[color:var(--text-faint)]">Catalyst: </span>{ti.catalyst}
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--text-dim)]">
                        <span className="text-[color:var(--text-faint)]">Risk: </span>{ti.risk}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Items */}
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
              Classified items ({priority.length})
            </p>
            <ul className="space-y-3">
              {priority.map((item, i) => (
                <li key={i} className={`rounded-lg border p-3 ${ITEM_COLOR[item.classification]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold">{item.headline}</p>
                      {item.source && (
                        <p className="mt-0.5 text-xs text-[color:var(--text-faint)]">
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {item.source}
                            </a>
                          ) : (
                            item.source
                          )}
                        </p>
                      )}
                    </div>
                    <span className="rounded bg-black/30 px-2 py-0.5 font-mono text-[10px] uppercase">
                      {item.classification.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-dim)]">{item.reasoning}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
