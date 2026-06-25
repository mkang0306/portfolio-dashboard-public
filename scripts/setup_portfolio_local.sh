#!/usr/bin/env bash
# One-time setup: maps portfolio.local -> localhost:80, starts Caddy as a reverse proxy.
# Run with: sudo ./scripts/setup_portfolio_local.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CADDYFILE="$ROOT/Caddyfile"

# 1. /etc/hosts entry
if grep -q "portfolio.local" /etc/hosts; then
  echo "[hosts] portfolio.local already in /etc/hosts — skipping"
else
  echo "127.0.0.1   portfolio.local" >> /etc/hosts
  echo "[hosts] added 127.0.0.1 portfolio.local"
fi

# 2. Caddy config — point system-wide caddy at our Caddyfile by symlinking it
SYS_CADDYFILE="/opt/homebrew/etc/Caddyfile"
mkdir -p "$(dirname "$SYS_CADDYFILE")"
if [[ -e "$SYS_CADDYFILE" && ! -L "$SYS_CADDYFILE" ]]; then
  mv "$SYS_CADDYFILE" "$SYS_CADDYFILE.bak.$(date +%s)"
  echo "[caddy] backed up existing $SYS_CADDYFILE"
fi
ln -sf "$CADDYFILE" "$SYS_CADDYFILE"
echo "[caddy] symlinked $CADDYFILE -> $SYS_CADDYFILE"

# 3. Start caddy as root so it can bind port 80, auto-start on login
brew services restart caddy >/dev/null
echo "[caddy] started as root via brew services (auto-starts on login)"

echo ""
echo "✓ Done. Make sure 'npm run dev' is running, then open: http://portfolio.local"
