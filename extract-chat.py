#!/usr/bin/env python3
"""
Extract recent chat messages from OpenClaw session transcripts
"""

import json
import os
from pathlib import Path
from datetime import datetime

SESSIONS_DIR = Path("/home/moltbot/.openclaw/agents/main/sessions")
API_DIR = Path("/home/moltbot/clawd/dashboards/api")

def extract_messages(filepath, limit=50):
    """Extract recent messages from a JSONL transcript"""
    messages = []
    session_info = None
    
    try:
        with open(filepath, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line.strip())
                    if data.get('type') == 'session':
                        session_info = data
                    elif data.get('type') == 'message':
                        msg = data.get('message', {})
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', [])
                        timestamp = data.get('timestamp', '')
                        
                        # Extract text content
                        text_parts = []
                        for part in content:
                            if isinstance(part, dict):
                                if part.get('type') == 'text':
                                    text_parts.append(part.get('text', ''))
                            elif isinstance(part, str):
                                text_parts.append(part)
                        
                        text = '\n'.join(text_parts).strip()
                        if text and not text.startswith('HEARTBEAT'):
                            messages.append({
                                'role': role,
                                'text': text[:500] + ('...' if len(text) > 500 else ''),
                                'timestamp': timestamp
                            })
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    
    # Return last N messages
    return messages[-limit:], session_info

def main():
    API_DIR.mkdir(parents=True, exist_ok=True)
    
    # Find the main session (current active one)
    # The current session is 6fa4cc8c-0778-48fe-8347-f41f67ec8d28
    main_session = SESSIONS_DIR / "6fa4cc8c-0778-48fe-8347-f41f67ec8d28.jsonl"
    
    sessions_data = []
    
    # Get all session files, sorted by modification time
    session_files = sorted(
        SESSIONS_DIR.glob("*.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )[:10]  # Last 10 sessions
    
    for session_file in session_files:
        messages, info = extract_messages(session_file, limit=30)
        if messages:
            sessions_data.append({
                'id': session_file.stem,
                'file': session_file.name,
                'messageCount': len(messages),
                'messages': messages,
                'info': info
            })
    
    # Write chat history
    with open(API_DIR / "chat-history.json", "w") as f:
        json.dump(sessions_data, f, indent=2, ensure_ascii=False)
    
    print(f"Extracted chat history from {len(sessions_data)} sessions")

if __name__ == "__main__":
    main()
