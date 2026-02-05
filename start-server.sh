#!/bin/bash
# Start the Botch Dashboard server

PORT=8765
DIR="/home/moltbot/clawd/dashboards"

# Check if already running
if lsof -i:$PORT > /dev/null 2>&1; then
    echo "Dashboard already running on port $PORT"
    exit 0
fi

# Update data first
echo "Updating dashboard data..."
$DIR/update-all.sh

# Start server
echo "Starting dashboard server on localhost:$PORT..."
cd $DIR
nohup python3 -m http.server $PORT --bind 127.0.0.1 > /dev/null 2>&1 &

echo "Dashboard started! Access via SSH tunnel at http://localhost:$PORT"
