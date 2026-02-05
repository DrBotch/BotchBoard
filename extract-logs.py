#!/usr/bin/env python3
"""
Extract chat logs from OpenClaw session transcripts for dashboard
"""

import json
import os
from pathlib import Path
from datetime import datetime

SESSIONS_DIR = Path("/home/moltbot/.openclaw/agents/main/sessions")
API_DIR = Path("/home/moltbot/clawd/dashboards/api")

def extract_session_info(filepath):
    """Extract session metadata and messages"""
    messages = []
    session_info = None
    first_msg_time = None
    last_msg_time = None
    
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
                        
                        if timestamp:
                            if not first_msg_time:
                                first_msg_time = timestamp
                            last_msg_time = timestamp
                        
                        # Extract text content
                        text_parts = []
                        for part in content:
                            if isinstance(part, dict):
                                if part.get('type') == 'text':
                                    text_parts.append(part.get('text', ''))
                            elif isinstance(part, str):
                                text_parts.append(part)
                        
                        text = '\n'.join(text_parts).strip()
                        if text and role in ('user', 'assistant') and not text.startswith('HEARTBEAT'):
                            # Skip tool results and NO_REPLY for cleaner logs
                            if text == 'NO_REPLY' or text.startswith('{'):
                                continue
                            messages.append({
                                'role': role,
                                'text': text,
                                'timestamp': timestamp
                            })
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return None
    
    stat = filepath.stat()
    
    return {
        'id': filepath.stem,
        'file': filepath.name,
        'size': stat.st_size,
        'modified': stat.st_mtime,
        'firstMessage': first_msg_time,
        'lastMessage': last_msg_time,
        'messageCount': len(messages),
        'messages': messages
    }

def main():
    API_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get all session files, sorted by modification time
    session_files = sorted(
        SESSIONS_DIR.glob("*.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    
    # Extract summary for session list (without full messages)
    sessions_summary = []
    
    for session_file in session_files:
        info = extract_session_info(session_file)
        if info:
            # Summary without full messages
            summary = {
                'id': info['id'],
                'file': info['file'],
                'size': info['size'],
                'modified': info['modified'],
                'firstMessage': info['firstMessage'],
                'lastMessage': info['lastMessage'],
                'messageCount': info['messageCount']
            }
            sessions_summary.append(summary)
            
            # Save individual session with full messages
            session_path = API_DIR / f"session-{info['id']}.json"
            with open(session_path, 'w') as f:
                json.dump(info, f, ensure_ascii=False)
    
    # Write sessions index
    with open(API_DIR / "sessions-index.json", "w") as f:
        json.dump(sessions_summary, f, indent=2, ensure_ascii=False)
    
    print(f"Extracted {len(sessions_summary)} session logs")

if __name__ == "__main__":
    main()
