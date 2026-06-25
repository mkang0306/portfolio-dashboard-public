# Portfolio Dashboard

A local-first, YAML-driven stock portfolio dashboard built with Next.js 15, React 19, and Tailwind. All your portfolio data stays on your machine in plain YAML files that you edit by hand. Market data is fetched live via Python (yfinance).

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![React](https://img.shields.io/badge/React-19-blue) ![Python](https://img.shields.io/badge/Python-3.9+-green)

## What it does

- **Overview**: total value, day P/L, time-series chart, positions table with sort/filter
- **Discover**: AI-powered thesis-fit scan, ETF look-through, macro signals, insider buys, theme winners
- **Analysis**: drift monitoring, sell trigger status, concentration meter, tax efficiency scores, Goodhart's Law ETF drift checks
- **Income**: dividend tracking, cash flow history
- **Notes**: decision journal, watchlist lifecycle (WATCH -> CONSIDER -> QUEUE -> BOUGHT/DECLINED), catalyst calendar

## Prerequisites

- **Node.js 18+** and npm
- **Python 3.9+** with pip
- An **Anthropic API key** (for the Discover tab's thesis-fit scan and per-ticker research; the rest of the dashboard works without it)

## Quick start

```bash
# 1. Clone the repo
git clone <your-repo-url> portfolio-dashboard
cd portfolio-dashboard

# 2. Install dependencies
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Set up your data files
cp -r data/example/* data/
# Now edit data/holdings.yaml with YOUR positions
# Edit data/thesis.md with YOUR investment thesis

# 4. (Optional) Add your Anthropic API key for AI features
cp .env.example .env.local
# Edit .env.local with your key

# 5. Build and run
npm run build
npm start
# Dashboard is at http://localhost:3000
```

## Data files

All source-of-truth data lives in `data/`. The dashboard reads these on every request -- edit them by hand and refresh.

| File | Purpose | Required? |
|------|---------|-----------|
| `holdings.yaml` | Your positions: ticker, shares, cost basis, account, target weight, thesis, sell triggers | **Yes** |
| `thesis.md` | Your investment thesis document. Used by thesis-fit scan to score candidates | **Yes** |
| `watchlist.yaml` | Tickers you're watching but don't hold yet | No (empty list ok) |
| `journal.yaml` | Decision journal entries | No (empty list ok) |
| `catalysts.yaml` | Upcoming dates that matter (earnings, reviews, events) | No (empty list ok) |
| `declined.yaml` | Tickers you explicitly declined (filtered from Discover) | No (empty list ok) |
| `tax-efficiency.yaml` | Per-holding tax efficiency scores and distribution data | No (empty list ok) |
| `etf-drift-checks.yaml` | Goodhart's Law monitoring for thematic ETFs | No (empty list ok) |
| `transactions.yaml` | Buy/sell history (can generate from broker CSV) | No |
| `dividends.yaml` | Dividend history | No |
| `cashflows.yaml` | Deposits, withdrawals, interest | No |

Template files with the correct structure are in `data/example/`.

## Architecture

**Hybrid Node + Python.** The Next.js app handles rendering and API routes. Market data, ETF holdings analysis, and analytics go through Python subprocess calls (yfinance + pandas). Each Python script caches results in `.cache/` with a per-script TTL.

```
app/
  api/          # Next.js API routes
  components/   # React components
  views/        # Tab views (Overview, Discover, Analysis, Income, Notes)
lib/            # TypeScript modules (portfolio math, holdings, prices)
scripts/        # Python data fetchers + utilities
data/           # Your YAML source-of-truth files
  example/      # Template files to copy from
```

## Always-on setup (macOS, optional)

The repo includes scripts to run the dashboard permanently via launchd + Caddy reverse proxy:

```bash
# Set up Caddy reverse proxy (portfolio.local -> localhost:3000)
bash scripts/setup_portfolio_local.sh

# Set up launchd to keep the server running
bash scripts/setup_always_on.sh
```

After setup, the dashboard is at `http://portfolio.local` and auto-restarts on crash/reboot.

## AI features

Two features use the Anthropic API (require `ANTHROPIC_API_KEY` in `.env.local`):

1. **Per-ticker research** (Research button on Overview) -- uses claude-haiku-4-5, ~$0.025/click
2. **Weekly thesis-fit scan** (Discover tab) -- uses claude-sonnet-4-6, ~$0.10/run

The rest of the dashboard (positions, charts, alerts, drift monitoring, tax efficiency, journal, watchlist) works entirely offline with no API key.

## Importing from Robinhood

Export your activity CSV from Robinhood and process it:

```bash
cp ~/Downloads/<robinhood-export>.csv data/inbox/
npm run process-inbox
```

This generates `transactions.yaml`, `dividends.yaml`, and `cashflows.yaml`.

## Claude Code setup

If you use [Claude Code](https://claude.ai/code), you can have it set up the entire dashboard for you. See `SETUP_PROMPT.md` for a ready-to-paste prompt.

## License

MIT
