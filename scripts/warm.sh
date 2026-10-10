#!/usr/bin/env bash
# Pre-warm backend before demos to avoid cold start
BACKEND_URL="${1:-http://localhost:8000}"
echo "Warming backend at $BACKEND_URL ..."
for i in {1..5}; do
  curl -s -f "$BACKEND_URL/health" > /dev/null && echo "Ping $i OK" || echo "Ping $i failed"
  sleep 1
done
echo "Warm-up complete."
