#!/usr/bin/env bash
# Make the dashboard always-on at portfolio.local.
#
# What this does:
#   1. Adds 127.0.0.1 portfolio.local to /etc/hosts (needs sudo)
#   2. Symlinks our Caddyfile so brew-installed Caddy serves us
#   3. Starts Caddy as root so it can bind port 80 (auto-restarts on login)
#   4. Generates and installs a launchd plist for the Next.js production server
#   5. Loads that plist so dashboard auto-starts at login and auto-restarts on crash
#
# After this runs, you can close every terminal you have open and the dashboard will keep running.
# Open http://portfolio.local in any browser.
#
# Usage: sudo ./scripts/setup_always_on.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

# Resolve the real user (since we're running as root via sudo)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(dscl . -read /Users/$REAL_USER NFSHomeDirectory | awk '{print $2}')"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.${REAL_USER}.portfolio-dashboard"
NODE_BIN="$(sudo -u "$REAL_USER" bash -c 'which node')"
NEXT_BIN="$ROOT/node_modules/next/dist/bin/next"

echo "Setting up for user: $REAL_USER (home: $REAL_HOME)"
echo "Project root: $ROOT"
echo "Node: $NODE_BIN"
echo "Label: $LABEL"
echo ""

# --- 1. /etc/hosts ---
if grep -q "portfolio.local" /etc/hosts; then
  echo "[hosts] portfolio.local already in /etc/hosts — skipping"
else
  echo "127.0.0.1   portfolio.local" >> /etc/hosts
  echo "[hosts] added 127.0.0.1 portfolio.local"
fi

# --- 2. Caddy config ---
SYS_CADDYFILE="/opt/homebrew/etc/Caddyfile"
mkdir -p "$(dirname "$SYS_CADDYFILE")"
if [[ -e "$SYS_CADDYFILE" && ! -L "$SYS_CADDYFILE" ]]; then
  mv "$SYS_CADDYFILE" "$SYS_CADDYFILE.bak.$(date +%s)"
  echo "[caddy] backed up existing $SYS_CADDYFILE"
fi
ln -sf "$ROOT/Caddyfile" "$SYS_CADDYFILE"
echo "[caddy] symlinked $ROOT/Caddyfile -> $SYS_CADDYFILE"

# --- 3. Start Caddy as root so it can bind port 80 ---
sudo -u "$REAL_USER" brew services restart caddy >/dev/null 2>&1 || true
brew services restart caddy >/dev/null
echo "[caddy] started as root via brew services (auto-restarts on login)"

# --- 4. Generate and install launchd plist ---
LAUNCH_AGENTS_DIR="$REAL_HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"
USER_UID="$(id -u "$REAL_USER")"

PLIST_PATH="$LAUNCH_AGENTS_DIR/${LABEL}.plist"
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${NEXT_BIN}</string>
    <string>start</string>
    <string>-p</string>
    <string>3000</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${ROOT}/.cache/dashboard.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/.cache/dashboard.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

chown "$REAL_USER" "$PLIST_PATH"
sudo -u "$REAL_USER" launchctl bootout "gui/$USER_UID/$LABEL" 2>/dev/null || true
sudo -u "$REAL_USER" launchctl bootstrap "gui/$USER_UID" "$PLIST_PATH"
sudo -u "$REAL_USER" launchctl enable "gui/$USER_UID/$LABEL"
sudo -u "$REAL_USER" launchctl kickstart -k "gui/$USER_UID/$LABEL"
echo "[launchd] $LABEL loaded — will auto-start at every login"

# Kill any orphaned dev-mode next instances we left around
pkill -f "next dev" 2>/dev/null || true

echo ""
echo "Done."
echo "  Dashboard:  http://portfolio.local"
echo ""
echo "Logs:"
echo "  tail -f $ROOT/.cache/dashboard.log       # dashboard stdout"
echo "  tail -f $ROOT/.cache/dashboard.err.log   # dashboard stderr"
echo ""
echo "Manual control:"
echo "  launchctl kickstart -k gui/$USER_UID/$LABEL       # restart dashboard"
echo "  launchctl bootout gui/$USER_UID/$LABEL             # stop dashboard"
echo ""
echo "To pick up code changes:"
echo "  cd $ROOT && npm run build && launchctl kickstart -k gui/$USER_UID/$LABEL"
