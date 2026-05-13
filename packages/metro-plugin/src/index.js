/**
 * @onatvaris/rn-network-debugger-metro-plugin
 *
 * Automatically starts the DevTools server when Metro launches.
 */

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const http = require('http');

let serverProcess = null;
const DEFAULT_PORT = 8788;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port);
  });
}

function resolveServerPath() {
  // npm install: resolve via the declared dependency
  try {
    return require.resolve('@onatvaris/rn-network-debugger-server/src/index.js');
  } catch {}

  // Fallback for monorepo / file: link setups
  const candidates = [
    path.resolve(__dirname, '..', 'server.js'),
    path.resolve(__dirname, '..', '..', 'server', 'src', 'index.js'),
    path.resolve(__dirname, '..', '..', '..', 'server', 'src', 'index.js'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

async function startDebuggerServer(port = DEFAULT_PORT) {
  const inUse = await isPortInUse(port);
  if (inUse) {
    console.log(`[RNNetworkDebugger] Server already running on port ${port}`);
    return;
  }

  const serverPath = resolveServerPath();

  if (!serverPath) {
    // Server file not found — start inline
    startInlineServer(port);
    return;
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, RN_DEBUGGER_PORT: String(port) },
    stdio: 'inherit',
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[RNNetworkDebugger] Failed to start server, switching to inline mode:', err.message);
    startInlineServer(port);
  });

  process.on('exit', () => {
    if (serverProcess) serverProcess.kill();
  });
}

function startInlineServer(port) {
  try {
    const ws = requireWS();
    startWSServer(port, ws);
  } catch (e) {
    startFallbackHTTPServer(port);
  }
}

function requireWS() {
  const searchPaths = [
    path.resolve(__dirname, '..', '..', '..', 'node_modules', 'ws'),
    path.resolve(__dirname, '..', 'node_modules', 'ws'),
    'ws',
  ];
  for (const p of searchPaths) {
    try { return require(p); } catch {}
  }
  throw new Error('ws not found');
}

function startWSServer(port, ws) {
  const { WebSocketServer } = ws;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getInlineUI(port));
  });

  const wss = new WebSocketServer({ server });
  const appClients = new Set();
  const uiClients = new Set();
  const history = [];
  const MAX_HISTORY = 1000;

  wss.on('connection', (socket, req) => {
    const isUI = (req.url || '').includes('/ui');

    if (isUI) {
      uiClients.add(socket);
      socket.send(JSON.stringify({ event: 'history', data: history }));
      socket.send(JSON.stringify({ event: 'server:status', data: { connectedApps: appClients.size } }));
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'clear_history') {
            history.length = 0;
            broadcast(uiClients, { event: 'history_cleared' });
          }
        } catch {}
      });
      socket.on('close', () => uiClients.delete(socket));
    } else {
      appClients.add(socket);
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (history.length >= MAX_HISTORY) history.shift();
          history.push(msg);
          broadcast(uiClients, msg);
        } catch {}
      });
      socket.on('close', () => appClients.delete(socket));
    }
  });

  function broadcast(clients, msg) {
    const data = JSON.stringify(msg);
    clients.forEach(c => { if (c.readyState === 1) { try { c.send(data); } catch {} } });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log(`║  RN Network Debugger Server                ║`);
    console.log(`║  DevTools UI  → http://localhost:${port}      ║`);
    console.log(`║  WS (app)     → ws://localhost:${port}/app    ║`);
    console.log('╚════════════════════════════════════════════╝\n');
  });
}

function startFallbackHTTPServer(port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="font-family:monospace;padding:24px;background:#0a0d14;color:#e2e8f0">
      <h2>⚠️ RN Network Debugger</h2>
      <p>Server started but the <code>ws</code> module could not be found.</p>
      <p>Fix:</p>
      <pre style="background:#1f2937;padding:12px;border-radius:6px">npm install @onatvaris/rn-network-debugger-metro-plugin</pre>
      <p>Then restart Metro.</p>
    </body></html>`);
  });
  server.listen(port, () => {
    console.warn(`[RNNetworkDebugger] ⚠️  ws module not found. Re-run npm install.`);
  });
}

function getInlineUI(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RN Network Debugger</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { background: #0a0d14; color: #e2e8f0; font-family: "Inter", -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #0f1117; border: 1px solid #1f2937; border-radius: 12px;
      padding: 32px; max-width: 480px; width: 100%; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    p { color: #6b7280; font-size: 13px; line-height: 1.6; margin-bottom: 16px; }
    pre { background: #1f2937; border-radius: 6px; padding: 12px; font-size: 12px;
      color: #a78bfa; overflow-x: auto; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; margin-right: 6px; box-shadow: 0 0 6px #22c55e; }
    #status { font-size: 12px; color: #6b7280; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⬡ RN Network Debugger</h1>
    <p>UI has not been built yet. Please reinstall the package:</p>
    <pre>npm install @onatvaris/rn-network-debugger-metro-plugin</pre>
    <p style="margin-top:16px">Then reload this page.</p>
    <div id="status">Connecting…</div>
  </div>
  <script>
    const ws = new WebSocket('ws://localhost:${port}/ui');
    ws.onopen = () => {
      document.getElementById('status').innerHTML =
        '<span class="dot"></span>Server connected, waiting for UI build';
    };
    ws.onclose = () => {
      document.getElementById('status').textContent = 'Disconnected';
    };
  </script>
</body>
</html>`;
}

function withNetworkDebugger(config, options = {}) {
  const port = options.port || DEFAULT_PORT;

  startDebuggerServer(port).catch((e) => {
    console.error('[RNNetworkDebugger] Başlatma hatası:', e.message);
  });

  const existingTransformer = config.transformer || {};

  return {
    ...config,
    transformer: {
      ...existingTransformer,
      getTransformOptions: async (...args) => {
        const base = existingTransformer.getTransformOptions
          ? await existingTransformer.getTransformOptions(...args)
          : {};
        return {
          ...base,
          transform: {
            ...(base.transform || {}),
            inlineRequires: base.transform?.inlineRequires || false,
          },
        };
      },
    },
    resolver: {
      ...(config.resolver || {}),
      extraNodeModules: {
        ...(config.resolver?.extraNodeModules || {}),
        '__rn_network_debugger_config__': {
          serverUrl: `ws://localhost:${port}/app`,
          uiUrl: `http://localhost:${port}`,
        },
      },
    },
  };
}

module.exports = { withNetworkDebugger, startDebuggerServer };
