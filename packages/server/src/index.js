/**
 * @rn-network-debugger/server
 *
 * İki tip WebSocket bağlantısını yönetir:
 *   1. RN App (core paketi) → olayları gönderir
 *   2. DevTools UI (tarayıcı) → olayları alır
 *
 * HTTP üzerinden de DevTools UI'ı sunar.
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const path = require('path');

const PORT = process.env.RN_DEBUGGER_PORT || 8788;
// UI dist: server/public/ içine gömülü (node_modules'da ui paketi olmak zorunda değil)
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

// ─── HTTP Sunucu ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// DevTools UI'ı sun (build edilmiş React uygulaması)
app.use(express.static(UI_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(UI_DIST, 'index.html'), (err) => {
    if (err) {
      res.status(200).json({
        status: 'running',
        message: 'RN Network Debugger Server çalışıyor. UI henüz build edilmemiş.',
        port: PORT,
      });
    }
  });
});

const server = http.createServer(app);

// ─── WebSocket Sunucu ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

const appClients = new Set();   // RN uygulamaları
const uiClients = new Set();    // DevTools tarayıcı panelleri

// Son N isteği bellekte tut (UI'ın sonradan bağlandığında geçmişi görmesi için)
const MAX_HISTORY = 1000;
const requestHistory = [];

wss.on('connection', (ws, req) => {
  const clientType = getClientType(req);

  if (clientType === 'app') {
    appClients.add(ws);
    console.log(`[Server] RN App bağlandı (toplam: ${appClients.size})`);

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Geçmişe ekle
      if (requestHistory.length >= MAX_HISTORY) {
        requestHistory.shift();
      }
      requestHistory.push(message);

      // Tüm UI istemcilerine ilet
      broadcastToUI(message);
    });

    ws.on('close', () => {
      appClients.delete(ws);
      console.log(`[Server] RN App bağlantısı kesildi (kalan: ${appClients.size})`);
    });

  } else if (clientType === 'ui') {
    uiClients.add(ws);
    console.log(`[Server] DevTools UI bağlandı (toplam: ${uiClients.size})`);

    // Yeni UI istemcisine geçmiş istekleri gönder
    ws.send(JSON.stringify({
      event: 'history',
      data: requestHistory,
    }));

    // Bağlı uygulama sayısını bildir
    ws.send(JSON.stringify({
      event: 'server:status',
      data: { connectedApps: appClients.size },
    }));

    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }

      // UI'dan gelen komutlar (ör. geçmişi temizle)
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
    console.error('[Server] WS hata:', err.message);
  });
});

function broadcastToUI(message) {
  const data = JSON.stringify(message);
  uiClients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(data); } catch { /* sessizce yoksay */ }
    }
  });
}

function getClientType(req) {
  // Bağlantı URL'sine göre ayırt et:
  // ws://localhost:8788/app → RN uygulaması
  // ws://localhost:8788/ui  → DevTools paneli
  const url = req.url || '';
  if (url.includes('/app')) return 'app';
  if (url.includes('/ui')) return 'ui';
  // Varsayılan: app (geriye dönük uyumluluk)
  return 'app';
}

// ─── Başlat ──────────────────────────────────────────────────────────────────
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
