#!/bin/bash
# Generates JSON data files for the Botch Dashboard
# Run this periodically to update dashboard data

API_DIR="/home/moltbot/clawd/dashboards/api"
MEMORY_DIR="/home/moltbot/clawd/memory"
WORKSPACE="/home/moltbot/clawd"

# Timestamp
echo "{\"generated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$API_DIR/meta.json"

# Memory files list
echo "[" > "$API_DIR/memory-files.json"
first=true
for f in "$MEMORY_DIR"/*.md; do
    if [ -f "$f" ]; then
        filename=$(basename "$f")
        size=$(stat -c%s "$f" 2>/dev/null || echo 0)
        modified=$(stat -c%Y "$f" 2>/dev/null || echo 0)
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$API_DIR/memory-files.json"
        fi
        # Escape content for JSON
        content=$(cat "$f" | head -50 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
        echo "{\"name\": \"$filename\", \"size\": $size, \"modified\": $modified, \"preview\": $content}" >> "$API_DIR/memory-files.json"
    fi
done
echo "]" >> "$API_DIR/memory-files.json"

# MEMORY.md content
if [ -f "$WORKSPACE/MEMORY.md" ]; then
    python3 -c "import json; print(json.dumps(open('$WORKSPACE/MEMORY.md').read()))" > "$API_DIR/memory-main.json"
fi

# Skills list
echo "[" > "$API_DIR/skills.json"
first=true
for skill_dir in /home/moltbot/clawd/skills/*/  /home/moltbot/.npm-global/lib/node_modules/openclaw/skills/*/; do
    if [ -d "$skill_dir" ]; then
        skill_name=$(basename "$skill_dir")
        skill_file="$skill_dir/SKILL.md"
        if [ -f "$skill_file" ]; then
            # Get first line (usually # title) and description
            title=$(head -1 "$skill_file" | sed 's/^# //')
            desc=$(grep -m1 "^>" "$skill_file" 2>/dev/null | sed 's/^> //' || echo "")
            if [ "$first" = true ]; then
                first=false
            else
                echo "," >> "$API_DIR/skills.json"
            fi
            echo "{\"name\": \"$skill_name\", \"title\": \"$title\", \"description\": \"$desc\"}" >> "$API_DIR/skills.json"
        fi
    fi
done
echo "]" >> "$API_DIR/skills.json"

echo "Dashboard data generated at $(date)"
