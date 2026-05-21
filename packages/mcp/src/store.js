const WebSocket = require('ws');

const MAX_REQUESTS = 2000;

class RequestStore {
  constructor() {
    this.requests = new Map(); // id → request object
    this.orderedIds = [];      // insertion order
    this.ws = null;
    this.connected = false;
    this.serverUrl = null;
  }

  connect(serverUrl) {
    this.serverUrl = serverUrl;
    this._connect();
  }

  _connect() {
    if (this.ws) {
      try { this.ws.terminate(); } catch {}
    }

    const ws = new WebSocket(this.serverUrl);
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.event === 'history' && Array.isArray(msg.data)) {
        msg.data.forEach(item => this._ingest(item));
        return;
      }

      if (msg.event === 'history_cleared') {
        this.requests.clear();
        this.orderedIds = [];
        return;
      }

      if (msg.data && msg.event) {
        this._ingest(msg.data);
      }
    });

    ws.on('close', () => {
      this.connected = false;
      setTimeout(() => this._connect(), 3000);
    });

    ws.on('error', () => {
      this.connected = false;
    });
  }

  _ingest(item) {
    if (!item || !item.id) return;

    const existing = this.requests.get(item.id);
    if (existing) {
      this.requests.set(item.id, { ...existing, ...item });
    } else {
      if (this.orderedIds.length >= MAX_REQUESTS) {
        const oldest = this.orderedIds.shift();
        this.requests.delete(oldest);
      }
      this.orderedIds.push(item.id);
      this.requests.set(item.id, item);
    }
  }

  getAll() {
    return this.orderedIds.map(id => this.requests.get(id)).filter(Boolean);
  }

  getById(id) {
    return this.requests.get(id) || null;
  }

  getRecent(n = 20) {
    const all = this.orderedIds;
    return all.slice(-n).map(id => this.requests.get(id)).filter(Boolean).reverse();
  }
}

module.exports = { RequestStore };
