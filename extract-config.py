#!/usr/bin/env python3
"""
Extract core configuration MD files for dashboard
"""

import json
from pathlib import Path

WORKSPACE = Path("/home/moltbot/clawd")
API_DIR = Path("/home/moltbot/clawd/dashboards/api")

CONFIG_FILES = [
    'AGENTS.md',
    'SOUL.md', 
    'USER.md',
    'IDENTITY.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'MEMORY.md'
]

def main():
    API_DIR.mkdir(parents=True, exist_ok=True)
    
    config_data = {}
    
    for filename in CONFIG_FILES:
        filepath = WORKSPACE / filename
        if filepath.exists():
            try:
                config_data[filename] = filepath.read_text(encoding='utf-8')
            except Exception as e:
                config_data[filename] = f"Error reading file: {e}"
        else:
            config_data[filename] = f"File not found: {filepath}"
    
    with open(API_DIR / "config-files.json", "w") as f:
        json.dump(config_data, f, ensure_ascii=False)
    
    print(f"Extracted {len(config_data)} config files")

if __name__ == "__main__":
    main()
