#!/usr/bin/env bash
# Triggered by launchd when data/inbox/ changes (WatchPaths).
# For each Robinhood activity CSV that arrives, validate header, move to
# data/robinhood_activity.csv, run parser, kickstart the dashboard.
#
# Why this design: launchd's WatchPaths fires on directory mtime change with no
# external dependency (no fswatch needed). The dashboard service already proves
# launchd can access this project's files, so no TCC issue here. The script
# itself runs via /opt/homebrew/bin/npm equivalent — see plist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INBOX="$ROOT/data/inbox"
DATA_CSV="$ROOT/data/robinhood_activity.csv"
PY="$ROOT/.venv/bin/python"
PARSER="$ROOT/scripts/parse_robinhood_csv.py"
LOG="$ROOT/.cache/inbox.log"

mkdir -p "$(dirname "$LOG")" "$INBOX"
exec >>"$LOG" 2>&1

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Robinhood activity-export header
EXPECTED_HEADER='"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"'

is_robinhood_csv() {
    local path="$1"
    [[ -f "$path" ]] || return 1
    [[ "$path" == *.csv ]] || return 1
    local first
    first="$(head -1 "$path" 2>/dev/null || echo "")"
    [[ "$first" == "$EXPECTED_HEADER" ]] || return 1
    return 0
}

# Find newly-arrived CSVs in inbox (any .csv file with the right header).
shopt -s nullglob
found=0
for csv in "$INBOX"/*.csv; do
    [[ -f "$csv" ]] || continue
    if ! is_robinhood_csv "$csv"; then
        log "skipping non-Robinhood file: $(basename "$csv")"
        mv "$csv" "$INBOX/$(basename "$csv").rejected.$(date -u +%Y%m%dT%H%M%S)" 2>/dev/null || true
        continue
    fi
    log "processing $(basename "$csv")"
    cp -f "$csv" "$DATA_CSV"
    if "$PY" "$PARSER" 2>&1; then
        log "  parser OK"
        # Archive the source so it's not reprocessed
        ARCHIVE="$INBOX/archive"
        mkdir -p "$ARCHIVE"
        mv "$csv" "$ARCHIVE/$(date -u +%Y%m%dT%H%M%S)_$(basename "$csv")"
        log "  archived → $ARCHIVE/"
        found=1
    else
        log "  parser FAILED — leaving CSV in inbox for inspection"
    fi
done

if (( found )); then
    if launchctl kickstart -k "gui/$(id -u)/com.$(whoami).portfolio-dashboard" 2>/dev/null; then
        log "dashboard kickstarted"
    fi
fi
