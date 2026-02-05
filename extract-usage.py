#!/usr/bin/env python3
"""
Extract usage/cost data from session transcripts
"""

import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

SESSIONS_DIR = Path("/home/moltbot/.openclaw/agents/main/sessions")
API_DIR = Path("/home/moltbot/clawd/dashboards/api")

def extract_usage():
    """Extract token usage and costs from all sessions"""
    total_tokens = {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}
    total_cost = 0.0
    by_model = defaultdict(lambda: {'tokens': 0, 'cost': 0.0, 'calls': 0})
    by_day = defaultdict(lambda: {'tokens': 0, 'cost': 0.0})
    recent_calls = []
    
    for session_file in SESSIONS_DIR.glob("*.jsonl"):
        try:
            with open(session_file, 'r') as f:
                for line in f:
                    try:
                        data = json.loads(line.strip())
                        if data.get('type') == 'message':
                            msg = data.get('message', {})
                            usage = msg.get('usage', {})
                            model = msg.get('model', 'unknown')
                            timestamp = data.get('timestamp', '')
                            
                            if usage:
                                inp = usage.get('input', 0)
                                out = usage.get('output', 0)
                                cache_r = usage.get('cacheRead', 0)
                                cache_w = usage.get('cacheWrite', 0)
                                cost_data = usage.get('cost', {})
                                cost = cost_data.get('total', 0) if isinstance(cost_data, dict) else 0
                                
                                total_tokens['input'] += inp
                                total_tokens['output'] += out
                                total_tokens['cacheRead'] += cache_r
                                total_tokens['cacheWrite'] += cache_w
                                total_cost += cost
                                
                                tokens_total = inp + out
                                by_model[model]['tokens'] += tokens_total
                                by_model[model]['cost'] += cost
                                by_model[model]['calls'] += 1
                                
                                if timestamp:
                                    day = timestamp[:10]
                                    by_day[day]['tokens'] += tokens_total
                                    by_day[day]['cost'] += cost
                                
                                # Keep recent calls
                                if timestamp and tokens_total > 0:
                                    recent_calls.append({
                                        'timestamp': timestamp,
                                        'model': model,
                                        'tokens': tokens_total,
                                        'cost': cost
                                    })
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            print(f"Error reading {session_file}: {e}")
    
    # Sort and limit recent calls
    recent_calls.sort(key=lambda x: x['timestamp'], reverse=True)
    recent_calls = recent_calls[:50]
    
    # Convert by_day to sorted list
    days_list = [{'date': k, **v} for k, v in sorted(by_day.items(), reverse=True)][:14]
    
    # Convert by_model to list
    models_list = [{'model': k, **v} for k, v in sorted(by_model.items(), key=lambda x: -x[1]['cost'])]
    
    result = {
        'generated': datetime.utcnow().isoformat() + 'Z',
        'totals': {
            'inputTokens': total_tokens['input'],
            'outputTokens': total_tokens['output'],
            'cacheReadTokens': total_tokens['cacheRead'],
            'cacheWriteTokens': total_tokens['cacheWrite'],
            'totalCost': round(total_cost, 4)
        },
        'byModel': models_list,
        'byDay': days_list,
        'recentCalls': recent_calls
    }
    
    with open(API_DIR / "usage.json", "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"Usage extracted: ${total_cost:.4f} total, {total_tokens['input'] + total_tokens['output']} tokens")

if __name__ == "__main__":
    extract_usage()
