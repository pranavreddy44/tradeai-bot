#!/bin/bash
# Auto-restart dev server
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start telegram mini-service if not running
if ! lsof -i :3002 >/dev/null 2>&1; then
  cd "$PROJECT_DIR/mini-services/telegram-listener"
  bun index.ts > service.log 2>&1 &
  sleep 2
fi

cd "$PROJECT_DIR"

# Clear cache on first start
if [ ! -d .next ]; then
  rm -rf .next
fi

# Start the dev server, restart if it crashes
while true; do
  echo "[$(date)] Starting Next.js dev server..."
  NODE_OPTIONS='--max-old-space-size=4096' node node_modules/.bin/next dev -p 3000
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 5 seconds..."
  sleep 5
  # Clear cache before restart to avoid stale compilation issues
  rm -rf .next
done
