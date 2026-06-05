const WebSocket = require('ws');

const MAX_REQUESTS = 2000;
const MAX_REDUX_ACTIONS = 500;

class RequestStore {
  constructor() {
    this.requests = new Map();      // id → request object
    this.orderedIds = [];
    this.reduxActions = new Map();  // id → redux action
    this.reduxOrder = [];
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
        msg.data.forEach(item => this._ingest(item.data, item.event));
        return;
      }

      if (msg.event === 'history_cleared') {
        this.requests.clear();
        this.orderedIds = [];
        this.reduxActions.clear();
        this.reduxOrder = [];
        return;
      }

      if (msg.data && msg.event) {
        this._ingest(msg.data, msg.event);
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

  _ingest(item, event) {
    if (!item || !item.id) return;

    if (event === 'redux:action') {
      if (this.reduxOrder.length >= MAX_REDUX_ACTIONS) {
        const oldest = this.reduxOrder.shift();
        this.reduxActions.delete(oldest);
      }
      this.reduxOrder.push(item.id);
      this.reduxActions.set(item.id, item);
      return;
    }

    if (event === 'console:log') return; // console logs not tracked in MCP

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

  getAllReduxActions() {
    return this.reduxOrder.map(id => this.reduxActions.get(id)).filter(Boolean);
  }

  getReduxActionById(id) {
    return this.reduxActions.get(id) || null;
  }
}

module.exports = { RequestStore };
