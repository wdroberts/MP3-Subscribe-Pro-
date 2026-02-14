#!/bin/bash
# Start MP3 Transcribe Pro and open in browser

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start dev servers (backend + frontend), then open browser
npm run dev &
DEV_PID=$!

# Wait for the frontend to be ready, then open browser
echo "Starting MP3 Transcribe Pro..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    xdg-open http://localhost:5173 2>/dev/null || open http://localhost:5173 2>/dev/null
    break
  fi
  sleep 1
done

# Keep running until user closes terminal or presses Ctrl+C
wait $DEV_PID
