#!/usr/bin/env node
/**
 * Botch Dashboard - Live Backend Server
 * Connects to OpenClaw gateway WebSocket and serves live data
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3456;
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'af08ac7542be48400e040054f2db2810a39f95f648418493';

// Device identity (simple approach - generate once and store)
const DEVICE_FILE = path.join(__dirname, '.device-identity.json');
let deviceIdentity = null;

function getOrCreateDeviceIdentity() {
  if (deviceIdentity) return deviceIdentity;
  
  try {
    if (fs.existsSync(DEVICE_FILE)) {
      deviceIdentity = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'));
      return deviceIdentity;
    }
  } catch (e) {
    console.log('[device] Failed to load existing identity:', e.message);
  }
  
  // Generate new identity
  const id = crypto.randomUUID();
  deviceIdentity = {
    id,
    createdAt: Date.now()
  };
  
  try {
    fs.writeFileSync(DEVICE_FILE, JSON.stringify(deviceIdentity, null, 2));
  } catch (e) {
    console.log('[device] Failed to save identity:', e.message);
  }
  
  return deviceIdentity;
}

// Gateway client
let gatewayWs = null;
let connected = false;
let pendingRequests = new Map();
let requestId = 0;
let connectNonce = null;

function connectGateway() {
  if (gatewayWs) {
    gatewayWs.close();
  }
  
  console.log(`[gateway] Connecting to ${GATEWAY_URL}...`);
  gatewayWs = new WebSocket(GATEWAY_URL);
  
  gatewayWs.on('open', () => {
    console.log('[gateway] WebSocket connected, waiting for challenge...');
    // Wait for challenge
    setTimeout(() => {
      if (!connected) sendConnect();
    }, 1000);
  });
  
  gatewayWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleGatewayMessage(msg);
    } catch (e) {
      console.error('[gateway] Parse error:', e);
    }
  });
  
  gatewayWs.on('close', (code, reason) => {
    console.log(`[gateway] Disconnected (${code}): ${reason}`);
    connected = false;
    connectNonce = null;
    flushPending(new Error('Gateway disconnected'));
    setTimeout(connectGateway, 3000);
  });
  
  gatewayWs.on('error', (err) => {
    console.error('[gateway] Error:', err.message);
  });
}

function sendConnect() {
  const device = getOrCreateDeviceIdentity();
  
  const connectMsg = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'gateway-client',
      version: '1.0.0',
      platform: 'node',
      mode: 'backend'
    },
    role: 'operator',
    scopes: ['operator.admin'],
    caps: [],
    auth: { token: GATEWAY_TOKEN }
  };
  
  console.log('[gateway] Sending connect with token auth...');
  
  gatewayRequest('connect', connectMsg).then((res) => {
    console.log('[gateway] Connected successfully!');
    connected = true;
  }).catch((err) => {
    console.error('[gateway] Connect failed:', err.message);
  });
}

function handleGatewayMessage(msg) {
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    console.log('[gateway] Received challenge, sending connect...');
    connectNonce = msg.payload?.nonce || null;
    sendConnect();
    return;
  }
  
  if (msg.type === 'res') {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      pendingRequests.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.payload);
      } else {
        pending.reject(new Error(msg.error?.message || 'Request failed'));
      }
    }
  }
}

function flushPending(err) {
  for (const [, p] of pendingRequests) {
    p.reject(err);
  }
  pendingRequests.clear();
}

function gatewayRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!gatewayWs || gatewayWs.readyState !== WebSocket.OPEN) {
      return reject(new Error('Gateway not connected'));
    }
    
    const id = `req-${++requestId}`;
    const msg = { type: 'req', id, method, params };
    
    pendingRequests.set(id, { resolve, reject });
    gatewayWs.send(JSON.stringify(msg));
    
    // Timeout
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

// API handlers
const apiHandlers = {
  'meta.json': async () => ({
    generatedAt: new Date().toISOString(),
    live: true,
    gateway: connected ? 'connected' : 'disconnected'
  }),
  
  'system.json': async () => {
    const { execSync } = require('child_process');
    
    // Get real system info
    let uptime = 'unknown';
    let disk = {};
    let memory = {};
    
    try {
      uptime = execSync('uptime -p', { encoding: 'utf8' }).trim();
    } catch (e) {}
    
    try {
      const dfOut = execSync('df -h / | tail -1', { encoding: 'utf8' }).trim().split(/\s+/);
      disk = { total: dfOut[1], used: dfOut[2], available: dfOut[3], percent: dfOut[4] };
    } catch (e) {}
    
    try {
      const freeOut = execSync('free -h | grep Mem', { encoding: 'utf8' }).trim().split(/\s+/);
      memory = { total: freeOut[1], used: freeOut[2], available: freeOut[6] };
    } catch (e) {}
    
    return { uptime, disk, memory };
  },
  
  'cron.json': async () => {
    const result = await gatewayRequest('cron.list', { includeDisabled: true });
    const jobs = result?.jobs || [];
    
    return jobs.map(job => {
      let schedule = '';
      let scheduleHuman = '';
      
      if (job.schedule?.kind === 'cron') {
        schedule = `${job.schedule.expr}${job.schedule.tz ? ` (${job.schedule.tz})` : ''}`;
        scheduleHuman = describeCron(job.schedule.expr);
      } else if (job.schedule?.kind === 'every') {
        const mins = Math.round(job.schedule.everyMs / 60000);
        schedule = `every ${mins}m`;
        scheduleHuman = `Every ${mins} min`;
      } else if (job.schedule?.kind === 'at') {
        schedule = `at ${new Date(job.schedule.atMs).toISOString()}`;
        scheduleHuman = `One-shot: ${new Date(job.schedule.atMs).toLocaleDateString()}`;
      }
      
      return {
        id: job.id,
        name: job.name || 'Unnamed',
        description: job.description || '',
        schedule,
        scheduleHuman,
        enabled: job.enabled !== false,
        status: job.state?.lastStatus || 'pending',
        error: job.state?.lastError || null,
        lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
        nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
        icon: getJobIcon(job)
      };
    });
  },
  
  'sessions.json': async () => {
    const result = await gatewayRequest('sessions.list', { 
      limit: 50,
      includeGlobal: true,
      includeUnknown: false
    });
    const sessions = result?.sessions || [];
    return sessions.map(s => ({
      key: s.key,
      displayName: s.label || s.key,
      channel: s.channel || 'unknown',
      model: s.model || 'unknown',
      totalTokens: s.usage?.totalTokens || 0,
      contextTokens: s.contextLimit || 200000,
      active: s.kind === 'main',
      lastActivity: s.lastMessage || ''
    }));
  },
  
  'sessions-index.json': async () => {
    const result = await gatewayRequest('sessions.list', { 
      limit: 100,
      includeGlobal: true,
      includeUnknown: true
    });
    const sessions = result?.sessions || [];
    return sessions.map(s => ({
      id: s.key,
      key: s.key,
      label: s.label || s.key,
      kind: s.kind || 'unknown',
      lastActiveAt: s.lastActiveAtMs ? new Date(s.lastActiveAtMs).toISOString() : null,
      messageCount: s.messageCount || 0
    }));
  },
  
  'skills.json': async () => {
    const result = await gatewayRequest('skills.status', {});
    const skills = result?.skills || [];
    return skills.map(s => ({
      name: s.name,
      title: s.name,
      description: s.description || '',
      path: s.filePath || '',
      status: s.eligible ? 'active' : s.disabled ? 'disabled' : 'unknown'
    }));
  },
  
  'usage.json': async () => {
    // Read from pre-generated usage file (updated by extract-usage.py)
    const usageFile = '/home/moltbot/clawd/dashboards/api/usage.json';
    try {
      const content = fs.readFileSync(usageFile, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      // Return empty structure if file doesn't exist
      return {
        generated: new Date().toISOString(),
        totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 },
        byModel: [],
        byDay: []
      };
    }
  },
  
  'memory-main.json': async () => {
    try {
      const content = fs.readFileSync('/home/moltbot/clawd/MEMORY.md', 'utf8');
      return content; // Return string directly
    } catch (e) {
      return '';
    }
  },
  
  'memory-files.json': async () => {
    const memDir = '/home/moltbot/clawd/memory';
    try {
      const files = fs.readdirSync(memDir)
        .filter(f => f.endsWith('.md') || f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(memDir, f);
          const stat = fs.statSync(filePath);
          let preview = '';
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            preview = content.slice(0, 1000);
          } catch (e) {}
          return {
            name: f,
            size: stat.size,
            modified: Math.floor(stat.mtime.getTime() / 1000),
            preview
          };
        })
        .sort((a, b) => b.modified - a.modified);
      return files; // Return array directly
    } catch (e) {
      return [];
    }
  },
  
  'config-files.json': async () => {
    const configDir = '/home/moltbot/clawd';
    const configFiles = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'USER.md', 'IDENTITY.md', 'HEARTBEAT.md', 'MEMORY.md'];
    const result = {};
    
    for (const f of configFiles) {
      try {
        const content = fs.readFileSync(path.join(configDir, f), 'utf8');
        result[f] = content;
      } catch (e) {
        // File doesn't exist
      }
    }
    return result;
  },
  
  'chat-history.json': async () => {
    try {
      // Get main session first
      const sessions = await gatewayRequest('sessions.list', { limit: 10 });
      const mainSession = sessions?.sessions?.find(s => s.kind === 'main') || sessions?.sessions?.[0];
      const sessionKey = mainSession?.key || 'agent:main:main';
      
      const result = await gatewayRequest('chat.history', { sessionKey, limit: 100 });
      return {
        messages: result?.messages || [],
        sessionKey: sessionKey
      };
    } catch (e) {
      return { messages: [], sessionKey: 'main', error: e.message };
    }
  }
};

// Session-specific handler
async function getSession(sessionId) {
  try {
    const history = await gatewayRequest('chat.history', { 
      sessionKey: sessionId,
      limit: 200 
    });
    return {
      id: sessionId,
      key: sessionId,
      messages: history?.messages || []
    };
  } catch (e) {
    return { id: sessionId, error: e.message, messages: [] };
  }
}

// Helper functions
function describeCron(expr) {
  const parts = expr.split(' ');
  if (parts.length < 5) return expr;
  
  const [min, hour, dom, mon, dow] = parts;
  
  if (dom === '*' && mon === '*' && dow === '*') {
    if (hour !== '*' && min !== '*') {
      return `Daily ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }
  }
  if (dow === '1' && dom === '*') {
    return `Mondays ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  if (min === '0' && hour.includes('-')) {
    return `Hourly ${hour}`;
  }
  
  return expr;
}

function getJobIcon(job) {
  const name = (job.name || '').toLowerCase();
  if (name.includes('weather') || name.includes('wetter')) return '🌤️';
  if (name.includes('email') || name.includes('mail')) return '📧';
  if (name.includes('watch')) return '📨';
  if (name.includes('stop') || name.includes('disable')) return '⏹️';
  if (name.includes('paper') || name.includes('document')) return '📄';
  if (name.includes('quota') || name.includes('monitor') || name.includes('alert')) return '⚠️';
  return '⏰';
}

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API routes
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname.slice(5);
    
    res.setHeader('Content-Type', 'application/json');
    
    try {
      let data;
      
      const sessionMatch = apiPath.match(/^session-(.+)\.json$/);
      if (sessionMatch) {
        data = await getSession(sessionMatch[1]);
      } else if (apiHandlers[apiPath]) {
        data = await apiHandlers[apiPath]();
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      
      res.writeHead(200);
      res.end(JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`[api] Error handling ${apiPath}:`, e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);
  
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Start
console.log('[server] Starting Botch Dashboard...');
connectGateway();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Botch Dashboard running at http://127.0.0.1:${PORT}`);
});
