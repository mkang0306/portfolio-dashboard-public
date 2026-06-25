# Claude Code Setup Prompt

Copy and paste the prompt below into a new Claude Code session to have it set up your portfolio dashboard. Before running, make sure you have Node.js 18+ and Python 3.9+ installed.

---

## The prompt

```
I just cloned the portfolio-dashboard repo into this directory. Help me set it up with my own portfolio data.

Here's what I need you to do:

1. Run `npm install` and set up the Python venv (`python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`).

2. Copy all files from `data/example/` to `data/` (don't overwrite if files already exist).

3. Walk me through filling in `data/holdings.yaml` with my actual positions. Ask me for:
   - Each ticker I hold
   - Number of shares
   - Cost basis (optional, enables P/L tracking)
   - Which account it's in (taxable or roth)
   - What percentage of my portfolio I want it to be (target_pct)
   - The expense ratio (for ETFs; null for stocks)
   - A one-line description of the position's function in my portfolio
   - A one-line thesis for why I hold it
   - At least one sell trigger per category (thesis_break, drift, opportunity)

4. Help me write `data/thesis.md` -- my investment thesis document. Ask me about:
   - My time horizon
   - My overall strategy (index-heavy, sector bets, factor tilts, etc.)
   - Account placement rationale
   - My discipline rules (when I sell, how I rebalance)
   - Risks I'm consciously accepting

5. Ask if I want to set up any of the optional data files:
   - `data/watchlist.yaml` -- tickers I'm considering
   - `data/catalysts.yaml` -- upcoming dates that matter
   - `data/tax-efficiency.yaml` -- tax scores for my holdings

6. Ask if I have an Anthropic API key for the AI features (thesis-fit scan, per-ticker research). If yes, create `.env.local` with it. If no, explain what they miss and move on.

7. Build the project (`npm run build`) and start it (`npm start`). Verify it loads at http://localhost:3000 and the API returns my holdings correctly (curl http://localhost:3000/api/holdings).

8. Ask if I want always-on setup (macOS only: launchd + Caddy so it runs at http://portfolio.local permanently).

Take it step by step. Don't rush -- each data file is important and I want to get the sell triggers right. For the thesis, push back if my triggers are vague ("if it goes down a lot" is not a trigger; "revenue growth turns negative for 2 consecutive quarters" is).
```
