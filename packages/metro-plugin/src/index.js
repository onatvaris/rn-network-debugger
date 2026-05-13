/**
 * @rn-network-debugger/metro-plugin
 *
 * Metro başladığında DevTools server'ını otomatik başlatır.
 * Server kodu bu pakete gömülüdür — ayrıca @rn-network-debugger/server
 * kurulumu gerekmez.
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

/**
 * Server script'ini bulur. Öncelik sırası:
 * 1. Bu paketin yanındaki gömülü server (en güvenilir)
 * 2. node_modules'daki @rn-network-debugger/server
 * 3. Monorepo / file: link yapısı
 */
function resolveServerPath() {
  const candidates = [
    // 1. Gömülü server (metro-plugin/server.js — aşağıda oluşturuyoruz)
    path.resolve(__dirname, '..', 'server.js'),
    // 2. Kardeş paket: node_modules/@rn-network-debugger/server/src/index.js
    path.resolve(__dirname, '..', '..', 'server', 'src', 'index.js'),
    // 3. Monorepo: packages/server/src/index.js
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
    console.log(`[RNNetworkDebugger] Server zaten çalışıyor (port ${port})`);
    return;
  }

  const serverPath = resolveServerPath();

  if (!serverPath) {
    // Server dosyası bulunamadı — inline olarak başlat
    startInlineServer(port);
    return;
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, RN_DEBUGGER_PORT: String(port) },
    stdio: 'inherit',
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[RNNetworkDebugger] Server başlatılamadı, inline moda geçiliyor:', err.message);
    startInlineServer(port);
  });

  process.on('exit', () => {
    if (serverProcess) serverProcess.kill();
  });
}

/**
 * Ayrı process yerine mevcut Node process içinde server başlatır.
 * ws modülü yoksa temel HTTP server açar ve uyarı verir.
 */
function startInlineServer(port) {
  try {
    // ws modülünü bul (metro'nun node_modules'ında da olabilir)
    const ws = requireWS();
    startWSServer(port, ws);
  } catch (e) {
    // ws yoksa sadece HTTP server aç, UI'a açıklayıcı mesaj ver
    startFallbackHTTPServer(port);
  }
}

function requireWS() {
  // Farklı node_modules konumlarında ws'i ara
  const searchPaths = [
    path.resolve(__dirname, '..', '..', '..', 'node_modules', 'ws'),
    path.resolve(__dirname, '..', 'node_modules', 'ws'),
    'ws',
  ];
  for (const p of searchPaths) {
    try { return require(p); } catch {}
  }
  throw new Error('ws bulunamadı');
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
      <p>Server başlatıldı fakat <code>ws</code> modülü bulunamadı.</p>
      <p>Çözüm:</p>
      <pre style="background:#1f2937;padding:12px;border-radius:6px">cd rn-network-debugger/packages/server
npm install
</pre>
      <p>Sonra Metro'yu yeniden başlat.</p>
    </body></html>`);
  });
  server.listen(port, () => {
    console.warn(`[RNNetworkDebugger] ⚠️  ws modülü bulunamadı. Lütfen packages/server içinde npm install çalıştır.`);
  });
}

function getInlineUI(port) {
  // UI build edilmemişse basit bir yönlendirme sayfası göster
  return `<!DOCTYPE html>
<html lang="tr">
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
    <p>UI henüz build edilmemiş. Aşağıdaki adımı tamamla:</p>
    <pre>cd rn-network-debugger/packages/ui
npm install
npm run build</pre>
    <p style="margin-top:16px">Build tamamlandıktan sonra bu sayfayı yenile.</p>
    <div id="status">Bağlanıyor…</div>
  </div>
  <script>
    const ws = new WebSocket('ws://localhost:${port}/ui');
    ws.onopen = () => {
      document.getElementById('status').innerHTML =
        '<span class="dot"></span>Server bağlı, UI build bekleniyor';
    };
    ws.onclose = () => {
      document.getElementById('status').textContent = 'Bağlantı kesildi';
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
