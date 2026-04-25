#!/bin/bash
# Double-click this file to start Sahiba CRM
# It auto-opens the browser when ready

cd "$(dirname "$0")"

echo "=========================================="
echo "  Sahiba CRM — Starting servers..."
echo "=========================================="
echo ""

# Kill any existing instances
pkill -f "node server.js" 2>/dev/null
pkill -f "vite --port 5175" 2>/dev/null
sleep 1

# Start backend
echo "  Starting backend (port 3001)..."
node server.js > /tmp/sahiba-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
for i in {1..20}; do
  if curl -s http://localhost:3001/api/settings > /dev/null 2>&1; then
    echo "  Backend ready ✓"
    break
  fi
  sleep 1
done

# Start frontend
echo "  Starting frontend (port 5175)..."
npx vite --port 5175 > /tmp/sahiba-frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend
for i in {1..20}; do
  if curl -s http://localhost:5175/ > /dev/null 2>&1; then
    echo "  Frontend ready ✓"
    break
  fi
  sleep 1
done

echo ""
echo "=========================================="
echo "  Sahiba CRM is running!"
echo "  Dashboard: http://localhost:5175"
echo "=========================================="
echo ""
echo "  Close this window to stop the servers"
echo ""

# Auto-open the browser
sleep 2
open http://localhost:5175/

# Keep window open and trap Ctrl+C or close to kill servers
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f 'node server.js' 2>/dev/null; pkill -f 'vite --port 5175' 2>/dev/null; exit 0" INT TERM EXIT

# Stream logs
tail -f /tmp/sahiba-backend.log /tmp/sahiba-frontend.log
