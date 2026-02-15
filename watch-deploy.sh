#!/bin/bash
# Auto-rebuild & redeploy on file changes
# Usage: ./watch-deploy.sh
# Requires: inotify-tools (sudo apt-get install -y inotify-tools)

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
COOLDOWN=5  # seconds to wait after change before rebuilding (debounce)

cd "$PROJECT_DIR"

echo "========================================"
echo "  Anthias Fleet Manager — Auto Deploy"
echo "========================================"
echo "Watching: $PROJECT_DIR"
echo "Cooldown: ${COOLDOWN}s"
echo "Press Ctrl+C to stop"
echo "========================================"
echo ""

# Initial build
echo "[$(date '+%H:%M:%S')] Initial build & deploy..."
docker compose up -d --build
echo "[$(date '+%H:%M:%S')] Ready! Watching for changes..."
echo ""

while true; do
    # Wait for file change event
    inotifywait -r -q \
        --exclude '(\.git|node_modules|__pycache__|static/dist|staticfiles|\.pyc|db\.sqlite3)' \
        -e modify,create,delete,move \
        "$PROJECT_DIR"

    # Debounce: wait a bit for batch saves to settle
    sleep "$COOLDOWN"

    # Drain any queued events during cooldown
    while inotifywait -r -q -t 1 \
        --exclude '(\.git|node_modules|__pycache__|static/dist|staticfiles|\.pyc|db\.sqlite3)' \
        -e modify,create,delete,move \
        "$PROJECT_DIR" 2>/dev/null; do
        sleep 1
    done

    echo "[$(date '+%H:%M:%S')] Changes detected — rebuilding..."
    if docker compose up -d --build 2>&1; then
        echo "[$(date '+%H:%M:%S')] Deploy OK"
    else
        echo "[$(date '+%H:%M:%S')] Deploy FAILED"
    fi
    echo ""
done
