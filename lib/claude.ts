import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env.local");
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Model selection by use case (cost-optimized May 2026):
// - RESEARCH_MODEL: on-demand per-ticker research clicks — Haiku is plenty for thesis-classification
//   of pre-fetched headlines, and clicks accumulate fast. Sonnet only when explicitly upgraded.
// - THESIS_FIT_MODEL: weekly thesis-fit scan — Sonnet for the deeper portfolio-level reasoning.
//   Runs once a week, can afford the better model.
export const RESEARCH_MODEL = "claude-haiku-4-5";
export const THESIS_FIT_MODEL = "claude-sonnet-4-6";
