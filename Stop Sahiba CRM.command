#!/bin/bash
# Double-click to stop Sahiba CRM
echo "Stopping Sahiba CRM..."
pkill -f "node server.js" 2>/dev/null
pkill -f "vite --port 5175" 2>/dev/null
echo "Stopped. You can close this window."
sleep 2
