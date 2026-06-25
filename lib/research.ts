import Anthropic from "@anthropic-ai/sdk";
import { getClient, RESEARCH_MODEL } from "./claude";
import { loadHoldings, loadThesis, type Holding } from "./holdings";
import { fetchYahooNews, type YahooNewsItem } from "./sources/yahooNews";
import { fetchSecFilings, type SecFiling } from "./sources/secFilings";
import { findSecondBrainNews, type SecondBrainNewsItem } from "./sources/secondbrainNews";

export type Classification = "confirms" | "neutral" | "contradicts" | "trigger_match";
export type Action = "hold" | "trim" | "add" | "sell" | "watch_thesis_break";
export type ThesisHealth = "confirmed" | "wobbling" | "threatened" | "unchanged";

export interface ResearchItem {
  headline: string;
  source?: string;
  url?: string;
  classification: Classification;
  reasoning: string;
}

export interface TradeIdea {
  position_type: "long" | "short" | "neutral";
  thesis: string;
  catalyst: string;
  risk: string;
}

export interface ResearchResult {
  ticker: string;
  // Morning-note structure per .claude/skills/equity-research/skills/morning-note/SKILL.md
  top_call: {
    headline: string;
    action: Action;
    reasoning: string;
  };
  thesis_status: ThesisHealth;
  summary: string;  // legacy summary line; kept for back-compat
  items: ResearchItem[];
  trade_ideas: TradeIdea[];
  sources_used: { yahoo: number; sec: number; secondbrain: number };
}

function systemPromptFor(holding: Holding, thesis: string): string {
  const triggers =
    holding.sell_triggers.length === 0
      ? "  (none defined yet — flag candidates worth writing down)"
      : holding.sell_triggers.map((t) => `  - ${t}`).join("\n");
  // Patterns ported from .claude/skills/equity-research/skills/morning-note/SKILL.md:
  // - Lead with the most important thing (top_call.headline)
  // - Be opinionated, not just summarize (top_call.action + thesis_status)
  // - 2-3 sentences per item, not paragraphs
  // - Distinguish actionable events from noise (trade_ideas vs items)
  return `You are a thesis-aligned research analyst writing a morning-note-style brief on a single position in Minho's personal portfolio.

You do not give buy/sell recommendations. You produce structured JSON. Be opinionated — research that just summarizes news without a view is useless. Lead with the most important thing; don't bury the headline.

================================
PORTFOLIO THESIS (canonical)
================================
${thesis}

================================
POSITION UNDER REVIEW
================================
Ticker: ${holding.ticker}
Name: ${holding.name}
Function: ${holding.function}
Per-position thesis: ${holding.thesis}
Target weight: ${holding.target_pct}%
Account: ${holding.account}
Written sell triggers:
${triggers}

================================
CLASSIFICATION RUBRIC (for items[])
================================
- "confirms"        — strengthens the thesis or per-position rationale
- "neutral"         — relevant context but doesn't move the thesis
- "contradicts"     — weakens the thesis or per-position rationale; not a sell trigger yet
- "trigger_match"   — directly matches a written sell trigger above. Use sparingly.

================================
ACTION RUBRIC (for top_call.action)
================================
- "hold"                  — thesis intact, no change to positioning needed
- "trim"                  — overweight + drift > target OR risk has increased
- "add"                   — underweight + thesis strengthening
- "sell"                  — sell-trigger fired (use sparingly; trigger_match required)
- "watch_thesis_break"    — thesis has weakened materially, define a fresh sell trigger before next quarter

================================
THESIS_STATUS RUBRIC
================================
- "confirmed"   — recent items confirm or strengthen the per-position thesis
- "unchanged"   — quiet period, nothing material
- "wobbling"    — one or more contradictions; not broken but worth re-reading the thesis
- "threatened"  — sustained contradictions OR a trigger_match; thesis review needed

================================
OUTPUT FORMAT
================================
Return ONLY a JSON object inside a single \`\`\`json ... \`\`\` block. No prose outside. Schema:

{
  "top_call": {
    "headline": "One sentence — the single most important thing to know about this position right now",
    "action": "hold" | "trim" | "add" | "sell" | "watch_thesis_break",
    "reasoning": "2-3 sentences justifying the action, citing specific evidence from items[] or trade_ideas[]"
  },
  "thesis_status": "confirmed" | "unchanged" | "wobbling" | "threatened",
  "summary": "1-2 sentence high-level digest (legacy field, keep concise)",
  "items": [
    { "headline": "...", "source": "...", "url": "...", "classification": "confirms"|"neutral"|"contradicts"|"trigger_match", "reasoning": "1-2 sentences mapping to a specific thesis clause" }
  ],
  "trade_ideas": [
    { "position_type": "long" | "short" | "neutral", "thesis": "...", "catalyst": "What specific event would prove this?", "risk": "What would make this wrong?" }
  ]
}

Rules:
- top_call is mandatory. It is the single takeaway a PM would want in 10 seconds.
- 5-10 items max, prioritized by importance. Skip generic market noise.
- Merge near-duplicates from different sources.
- Every item reasoning must reference a specific clause of the thesis or trigger.
- Authoritative SEC filings (revenue miss, segment shift, major litigation) take priority.
- trade_ideas is optional — empty array if nothing actionable. Don't fabricate.
- Use web_search to fill gaps in the bundled corpus (capped at 2 searches per claude-api cost-optimization).`;
}

function formatCorpus(
  yahoo: YahooNewsItem[],
  sec: SecFiling[],
  sb: SecondBrainNewsItem[],
): string {
  const blocks: string[] = [];
  if (yahoo.length) {
    blocks.push("## Yahoo Finance ticker news");
    yahoo.forEach((y) => {
      blocks.push(`- [${y.publisher}] ${y.title} (${y.published}) — ${y.link}`);
    });
  }
  if (sec.length) {
    blocks.push("\n## SEC filings (EDGAR)");
    sec.forEach((s) => {
      blocks.push(`- ${s.form} filed ${s.filed} — ${s.url}`);
    });
  }
  if (sb.length) {
    blocks.push("\n## From Minho's curated news stack (WSJ/Economist/Yahoo Morning Brief/etc.)");
    sb.forEach((s) => {
      blocks.push(`- [${s.source}] ${s.headline} — ${s.url}\n    ${s.summary}`);
    });
  }
  if (blocks.length === 0) {
    blocks.push("(No items from local sources. Use web_search to gather coverage.)");
  }
  return blocks.join("\n");
}

function parseJsonBlock(text: string): {
  top_call?: ResearchResult["top_call"];
  thesis_status?: ThesisHealth;
  summary: string;
  items: ResearchItem[];
  trade_ideas?: TradeIdea[];
} {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = match ? match[1] : text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) throw new Error(`No JSON in response: ${text.slice(0, 300)}`);
  return JSON.parse(raw);
}

export async function runResearch(ticker: string): Promise<ResearchResult> {
  const { holdings } = loadHoldings();
  const holding = holdings.find((h) => h.ticker === ticker);
  if (!holding) throw new Error(`Unknown ticker: ${ticker}`);
  const thesis = loadThesis();

  // Gather sources in parallel; tolerate individual failures.
  const [yahooMap, secMap] = await Promise.all([
    fetchYahooNews([ticker]).catch(() => ({ [ticker]: [] }) as Record<string, YahooNewsItem[]>),
    fetchSecFilings([ticker]).catch(() => ({ [ticker]: [] }) as Record<string, SecFiling[]>),
  ]);
  const yahoo = yahooMap[ticker] ?? [];
  const sec = secMap[ticker] ?? [];
  const sb = findSecondBrainNews(ticker, holding.name, [holding.function]);

  const corpus = formatCorpus(yahoo, sec, sb);
  const userMessage = `Bundled corpus for ${ticker} (last ~30 days):\n\n${corpus}\n\nClassify each item against the thesis. Use web_search to fill obvious gaps. Return the JSON.`;

  const client = getClient();
  const response = await client.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPromptFor(holding, thesis),
        cache_control: { type: "ephemeral" },
      },
    ],
    // Cost cap: 2 web searches max (vs 4 prior). Each search ≈ $0.01.
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    ] as Anthropic.Messages.ToolUnion[],
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseJsonBlock(text);
  return {
    ticker,
    top_call: parsed.top_call ?? {
      headline: parsed.summary ?? "—",
      action: "hold",
      reasoning: "Model did not return a top_call; defaulting to hold.",
    },
    thesis_status: parsed.thesis_status ?? "unchanged",
    summary: parsed.summary ?? parsed.top_call?.headline ?? "",
    items: parsed.items ?? [],
    trade_ideas: parsed.trade_ideas ?? [],
    sources_used: { yahoo: yahoo.length, sec: sec.length, secondbrain: sb.length },
  };
}
