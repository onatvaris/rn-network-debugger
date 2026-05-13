/**
 * NetworkEventEmitter
 *
 * Tüm interceptor'ların yakaladığı olayları merkezi bir
 * event bus üzerinden iletir. Transport katmanı bu emitter'a abone olur.
 */

let _idCounter = 0;

function generateId() {
  return `req_${Date.now()}_${++_idCounter}`;
}

export class NetworkEventEmitter {
  constructor(ignoredHosts = []) {
    this._listeners = [];
    this._ignoredHosts = ignoredHosts;
    this._requests = new Map(); // id → request data
  }

  /**
   * Yeni bir istek başladığında çağrılır.
   * @returns {string} requestId - sonraki olaylarda kullanılacak ID
   */
  onRequestStart({ url, method, headers, body, type = 'fetch' }) {
    if (this._isIgnored(url)) return null;

    const id = generateId();
    const event = {
      id,
      type,           // 'fetch' | 'xhr' | 'axios' | 'websocket'
      url,
      method: method?.toUpperCase() || 'GET',
      headers: headers || {},
      body: this._sanitizeBody(body),
      startTime: Date.now(),
      status: 'pending',
    };

    this._requests.set(id, event);
    this._emit('request:start', event);
    return id;
  }

  onRequestHeadersUpdate(id, headers) {
    if (!id) return;
    const req = this._requests.get(id);
    if (!req) return;
    const updated = { ...req, headers };
    this._requests.set(id, updated);
    this._emit('request:update', updated);
  }

  onRequestDone(id, { status, statusText, headers, body, size }) {
    if (!id) return;
    const req = this._requests.get(id);
    if (!req) return;

    const updated = {
      ...req,
      status: 'done',
      responseStatus: status,
      responseStatusText: statusText,
      responseHeaders: headers || {},
      responseBody: this._sanitizeBody(body),
      responseSize: size || 0,
      endTime: Date.now(),
      duration: Date.now() - req.startTime,
    };

    this._requests.set(id, updated);
    this._emit('request:done', updated);
  }

  /**
   * İstek hata verdiğinde çağrılır.
   */
  onRequestError(id, error) {
    if (!id) return;
    const req = this._requests.get(id);
    if (!req) return;

    const updated = {
      ...req,
      status: 'error',
      error: error?.message || String(error),
      endTime: Date.now(),
      duration: Date.now() - req.startTime,
    };

    this._requests.set(id, updated);
    this._emit('request:error', updated);
  }

  /**
   * WebSocket mesajı için
   */
  onWSMessage(id, { direction, data }) {
    if (!id) return;
    this._emit('ws:message', {
      id,
      direction,  // 'send' | 'receive'
      data: this._sanitizeBody(data),
      timestamp: Date.now(),
    });
  }

  subscribe(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  _emit(event, data) {
    const message = { event, data, timestamp: Date.now() };
    this._listeners.forEach(l => {
      try { l(message); } catch (e) { /* sessizce yoksay */ }
    });
  }

  _isIgnored(url) {
    if (!url) return true;
    try {
      const hostname = new URL(url).host;
      return this._ignoredHosts.some(h => hostname.includes(h));
    } catch {
      return false;
    }
  }

  _sanitizeBody(body) {
    if (body === null || body === undefined) return null;
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch { return body; }
    }
    if (body instanceof FormData) {
      const entries = {};
      body.forEach((value, key) => {
        if (value && typeof value === 'object' && (value.uri != null || value.name != null)) {
          // RN FormData file: { uri, name, type } — no size property
          const label = value.name || 'unknown';
          const type = value.type || 'unknown type';
          const uri = value.uri ? `, uri: ${value.uri}` : '';
          entries[key] = `[File: ${label}, ${type}${uri}]`;
        } else {
          entries[key] = value;
        }
      });
      return { _type: 'FormData', entries };
    }
    if (body instanceof ArrayBuffer) return '[ArrayBuffer]';
    if (body instanceof Blob) return '[Blob]';
    return body;
  }
}
