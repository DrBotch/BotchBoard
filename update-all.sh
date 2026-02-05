#!/bin/bash
# Update all dashboard data
# Run this periodically to refresh the dashboard

cd /home/moltbot/clawd/dashboards

echo "Updating dashboard data..."

# Run Python data generator
python3 generate-data.py 2>/dev/null

# Extract chat history
python3 extract-chat.py 2>/dev/null

# Extract full session logs
python3 extract-logs.py 2>/dev/null

# Extract usage/cost data
python3 extract-usage.py 2>/dev/null

# Extract config files
python3 extract-config.py 2>/dev/null

# Check skill status
python3 check-skills.py 2>/dev/null

echo "Done at $(date)"
