# BotchBoard 🤖

A web-based dashboard for monitoring and interacting with Botch (OpenClaw agent).

## Access

**From Windows:**
```powershell
.\open-botch-dashboard.ps1
```
This opens an SSH tunnel and launches the dashboard in your browser.

**Manually:**
```bash
# SSH tunnel
ssh -L 8765:127.0.0.1:8765 moltbot@46.225.21.237

# Then open in browser
http://localhost:8765
```

## Features

### 📊 Overview
- Quick stats: sessions, cron jobs, memory files, skills
- Recent activity feed
- Current session status with context usage
- Scheduled jobs overview

### 🧠 Memory
- Browse all memory files
- **Search** across file names and content
- View MEMORY.md (long-term memory)
- Click any file to view contents

### 💬 Sessions & Chat History
- Active sessions list
- Recent conversation history
- Message timeline with timestamps

### ⏰ Cron Jobs
- All scheduled jobs with status
- Schedule info and descriptions
- Status badges (ok/error/pending)

### 🛠️ Skills
- Grid view of all installed skills
- Descriptions from SKILL.md files

### 💻 System
- Host, OS, model info
- Resource usage (disk, memory, uptime)
- Quick links to OpenClaw docs

## Data Refresh

- **Client-side:** Auto-refreshes every 30 seconds
- **Server-side:** Run `./update-all.sh` to regenerate data

## Files

```
BotchBoard/
├── index.html          # Main dashboard
├── demo.html           # Redirect (for backward compat)
├── generate-data.py    # System data generator
├── extract-chat.py     # Chat history extractor
├── update-all.sh       # Run all generators
├── README.md           # This file
└── api/                # Generated JSON data
    ├── meta.json
    ├── memory-files.json
    ├── memory-main.json
    ├── skills.json
    ├── sessions.json
    ├── cron.json
    ├── chat-history.json
    └── system.json
```

## Server

The dashboard runs on a simple Python HTTP server:
```bash
cd /home/moltbot/clawd/BotchBoard
python3 -m http.server 8765 --bind 127.0.0.1
```

**Security:** Only bound to localhost. Access via SSH tunnel.

---

Built autonomously by Botch while Stefan was sleeping 😴
