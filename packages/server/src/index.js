/**
 * @onatvaris/rn-network-debugger-server
 *
 * Manages two types of WebSocket connections:
 *   1. RN App (core package) → sends events
 *   2. DevTools UI (browser) → receives events
 *
 * Also serves the DevTools UI over HTTP.
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const path = require('path');

const PORT = process.env.RN_DEBUGGER_PORT || 8788;

const UI_DIST = (function() {
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, '../public'),
    path.join(__dirname, '../../ui/dist'),
    path.join(__dirname, '../../../ui/dist'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'index.html'))) return p;
  }
  return path.join(__dirname, '../public');
})();

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(UI_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(UI_DIST, 'index.html'), (err) => {
    if (err) {
      res.status(200).json({
        status: 'running',
        message: 'RN Network Debugger Server is running. UI has not been built yet.',
        port: PORT,
      });
    }
  });
});

const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

const appClients = new Set();
const uiClients = new Set();

const MAX_HISTORY = 1000;
const requestHistory = [];

wss.on('connection', (ws, req) => {
  const clientType = getClientType(req);

  if (clientType === 'app') {
    appClients.add(ws);
    console.log(`[Server] RN App connected (total: ${appClients.size})`);

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (requestHistory.length >= MAX_HISTORY) {
        requestHistory.shift();
      }
      requestHistory.push(message);

      broadcastToUI(message);
    });

    ws.on('close', () => {
      appClients.delete(ws);
      console.log(`[Server] RN App disconnected (remaining: ${appClients.size})`);
    });

  } else if (clientType === 'ui') {
    uiClients.add(ws);
    console.log(`[Server] DevTools UI connected (total: ${uiClients.size})`);

    ws.send(JSON.stringify({
      event: 'history',
      data: requestHistory,
    }));

    ws.send(JSON.stringify({
      event: 'server:status',
      data: { connectedApps: appClients.size },
    }));

    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }

      if (message.type === 'clear_history') {
        requestHistory.length = 0;
        broadcastToUI({ event: 'history_cleared' });
      }
    });

    ws.on('close', () => {
      uiClients.delete(ws);
    });
  }

  ws.on('error', (err) => {
    console.error('[Server] WS error:', err.message);
  });
});

function broadcastToUI(message) {
  const data = JSON.stringify(message);
  uiClients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  });
}

function getClientType(req) {
  const url = req.url || '';
  if (url.includes('/app')) return 'app';
  if (url.includes('/ui')) return 'ui';
  return 'app';
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const uiUrl = `http://localhost:${PORT}`;
  console.log('\n╔════════════════════════════════════════════╗');
  console.log(`║  RN Network Debugger Server                ║`);
  console.log(`║  DevTools UI  → ${uiUrl.padEnd(26)}║`);
  console.log(`║  WS (app)     → ws://localhost:${PORT}/app  ║`);
  console.log(`║  WS (ui)      → ws://localhost:${PORT}/ui   ║`);
  console.log('╚════════════════════════════════════════════╝\n');
});

module.exports = { server, wss };
