import { useState, useEffect, useRef, useCallback } from 'react';

// ─── WebSocket bağlantısı ────────────────────────────────────────────────────
function useDebuggerConnection() {
  const [requests, setRequests] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connectedApps, setConnectedApps] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ui`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.event === 'history') {
          // Sunucudan gelen geçmiş istekler
          const reqs = {};
          msg.data.forEach(item => processMessage(item, reqs));
          setRequests(Object.values(reqs).sort((a, b) => a.startTime - b.startTime));
          return;
        }

        if (msg.event === 'history_cleared') {
          setRequests([]);
          return;
        }

        if (msg.event === 'server:status') {
          setConnectedApps(msg.data.connectedApps);
          return;
        }

        setRequests(prev => {
          const map = {};
          prev.forEach(r => { map[r.id] = r; });
          processMessage(msg, map);
          return Object.values(map).sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
        });
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clearAll = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'clear_history' }));
    setRequests([]);
  }, []);

  return { requests, connected, connectedApps, clearAll };
}

function processMessage(msg, map) {
  if (!msg?.data?.id) return;
  const { event, data } = msg;
  if (event === 'request:start') {
    map[data.id] = { ...data };
  } else if (event === 'request:done' || event === 'request:error') {
    map[data.id] = { ...(map[data.id] || {}), ...data };
  } else if (event === 'ws:message') {
    const req = map[data.id];
    if (req) {
      map[data.id] = {
        ...req,
        wsMessages: [...(req.wsMessages || []), data],
      };
    }
  }
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function statusColor(req) {
  if (req.status === 'pending') return '#f59e0b';
  if (req.status === 'error') return '#ef4444';
  const s = req.responseStatus;
  if (!s) return '#6b7280';
  if (s < 300) return '#22c55e';
  if (s < 400) return '#f59e0b';
  return '#ef4444';
}

function methodColor(method) {
  const map = {
    GET: '#60a5fa', POST: '#a78bfa', PUT: '#f59e0b',
    DELETE: '#ef4444', PATCH: '#f97316', WS: '#22d3ee',
  };
  return map[method] || '#9ca3af';
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

function JsonView({ data }) {
  if (data === null || data === undefined) return <span style={{ color: '#6b7280' }}>null</span>;
  if (typeof data === 'string') {
    return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d1d5db', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>{data}</pre>;
  }
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d1d5db', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function RequestDetail({ req, onClose }) {
  const [tab, setTab] = useState('response');

  if (!req) return null;

  const tabs = ['response', 'request', 'headers', 'timing'];
  if (req.type === 'websocket') tabs.push('messages');

  return (
    <div style={{
      width: '45%', borderLeft: '1px solid #1f2937', display: 'flex',
      flexDirection: 'column', background: '#0f1117', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: methodColor(req.method), fontWeight: 700, fontSize: 11, letterSpacing: 1, fontFamily: 'monospace' }}>
              {req.method}
            </span>
            <span style={{ color: statusColor(req), fontSize: 11, fontWeight: 600 }}>
              {req.responseStatus || (req.status === 'pending' ? '…' : req.status)}
            </span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>{formatDuration(req.duration)}</span>
          </div>
          <div style={{ color: '#9ca3af', fontSize: 11, wordBreak: 'break-all', lineHeight: 1.5 }}>{req.url}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', paddingLeft: 16 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab === t ? '#e2e8f0' : '#6b7280', padding: '8px 12px', cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'response' && (
          <div>
            {req.error ? (
              <div style={{ color: '#ef4444', fontSize: 13, fontFamily: 'monospace' }}>{req.error}</div>
            ) : req.responseBody !== undefined ? (
              <JsonView data={req.responseBody} />
            ) : (
              <span style={{ color: '#6b7280', fontSize: 12 }}>Yanıt bekleniyor…</span>
            )}
          </div>
        )}

        {tab === 'request' && (
          <div>
            {req.body !== undefined && req.body !== null ? (
              <JsonView data={req.body} />
            ) : (
              <span style={{ color: '#6b7280', fontSize: 12 }}>İstek body'si yok</span>
            )}
          </div>
        )}

        {tab === 'headers' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>İstek Header'ları</div>
              {Object.entries(req.headers || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: '#60a5fa', fontSize: 12, fontFamily: 'monospace', minWidth: 180 }}>{k}:</span>
                  <span style={{ color: '#d1d5db', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
            {req.responseHeaders && Object.keys(req.responseHeaders).length > 0 && (
              <div>
                <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Yanıt Header'ları</div>
                {Object.entries(req.responseHeaders).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#a78bfa', fontSize: 12, fontFamily: 'monospace', minWidth: 180 }}>{k}:</span>
                    <span style={{ color: '#d1d5db', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'timing' && (
          <div>
            {[
              { label: 'Başlangıç', value: req.startTime ? new Date(req.startTime).toLocaleTimeString() : '—' },
              { label: 'Bitiş', value: req.endTime ? new Date(req.endTime).toLocaleTimeString() : '—' },
              { label: 'Süre', value: formatDuration(req.duration) },
              { label: 'Yanıt Boyutu', value: formatSize(req.responseSize) },
              { label: 'Tür', value: req.type },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{label}</span>
                <span style={{ color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'messages' && (
          <div>
            {(req.wsMessages || []).length === 0 ? (
              <span style={{ color: '#6b7280', fontSize: 12 }}>Henüz mesaj yok</span>
            ) : (
              (req.wsMessages || []).map((msg, i) => (
                <div key={i} style={{
                  marginBottom: 8, padding: 8, borderRadius: 6,
                  background: msg.direction === 'send' ? '#1e3a5f' : msg.direction === 'receive' ? '#1a3a2a' : '#2a1a1a',
                  border: `1px solid ${msg.direction === 'send' ? '#2563eb33' : msg.direction === 'receive' ? '#16a34a33' : '#ef444433'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: msg.direction === 'send' ? '#60a5fa' : msg.direction === 'receive' ? '#22c55e' : '#ef4444', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {msg.direction === 'send' ? '↑ Gönderildi' : msg.direction === 'receive' ? '↓ Alındı' : '✕ Kapatıldı'}
                    </span>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <JsonView data={msg.data} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ana App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { requests, connected, connectedApps, clearAll } = useDebuggerConnection();
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = requests.filter(req => {
    if (filter && !req.url?.toLowerCase().includes(filter.toLowerCase())) return false;
    if (typeFilter !== 'all' && req.type !== typeFilter) return false;
    if (statusFilter === 'error' && req.status !== 'error' && (req.responseStatus < 400 || !req.responseStatus)) return false;
    if (statusFilter === 'success' && (req.status === 'error' || req.responseStatus >= 400)) return false;
    if (statusFilter === 'pending' && req.status !== 'pending') return false;
    return true;
  });

  const selectedReq = selected ? requests.find(r => r.id === selected) : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0a0d14', color: '#e2e8f0',
      fontFamily: '"Inter", -apple-system, sans-serif',
    }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        height: 48, background: '#0f1117', borderBottom: '1px solid #1f2937',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>⬡</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', letterSpacing: 0.3 }}>RN Network Debugger</span>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', boxShadow: connected ? '0 0 6px #22c55e' : 'none' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {connected ? `${connectedApps} uygulama bağlı` : 'Bağlanıyor…'}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Filters */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="URL filtrele…"
          style={{
            background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
            color: '#e2e8f0', padding: '5px 10px', fontSize: 12, width: 200,
            outline: 'none',
          }}
        />

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }}>
          <option value="all">Tüm Türler</option>
          <option value="fetch">fetch</option>
          <option value="xhr">XHR</option>
          <option value="axios">axios</option>
          <option value="native_http">Native HTTP</option>
          <option value="websocket">WebSocket</option>
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }}>
          <option value="all">Tüm Durumlar</option>
          <option value="success">Başarılı</option>
          <option value="error">Hatalı</option>
          <option value="pending">Bekliyor</option>
        </select>

        <button onClick={clearAll} style={{
          background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
          color: '#9ca3af', padding: '5px 10px', fontSize: 12, cursor: 'pointer',
        }}>
          🗑 Temizle
        </button>

        <span style={{ fontSize: 11, color: '#4b5563' }}>{filtered.length} istek</span>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 12px',
        height: 32, background: '#0d1019', borderBottom: '1px solid #1f2937',
        flexShrink: 0,
      }}>
        {[
          { label: 'Durum', w: 70 },
          { label: 'Yöntem', w: 60 },
          { label: 'Tür', w: 80 },
          { label: 'URL', flex: 1 },
          { label: 'Süre', w: 70, align: 'right' },
          { label: 'Boyut', w: 70, align: 'right' },
        ].map(col => (
          <div key={col.label} style={{
            width: col.w, flex: col.flex, textAlign: col.align || 'left',
            fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: 0.8,
            textTransform: 'uppercase', paddingRight: 8,
          }}>
            {col.label}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Request List */}
        <div style={{ flex: selectedReq ? '55%' : 1, overflow: 'auto', minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <div style={{ fontSize: 40 }}>📡</div>
              <div style={{ color: '#4b5563', fontSize: 13 }}>
                {requests.length === 0 ? 'RN uygulamanızdaki network istekleri burada görünecek' : 'Filtreyle eşleşen istek yok'}
              </div>
              {!connected && (
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  Metro başlatıldığında server otomatik bağlanır
                </div>
              )}
            </div>
          ) : (
            filtered.map((req, idx) => (
              <div
                key={req.id}
                onClick={() => setSelected(req.id === selected ? null : req.id)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '0 12px',
                  height: 36, cursor: 'pointer', borderBottom: '1px solid #111827',
                  background: selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (selected !== req.id) e.currentTarget.style.background = '#151a27'; }}
                onMouseLeave={e => { e.currentTarget.style.background = selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019'; }}
              >
                {/* Status */}
                <div style={{ width: 70, paddingRight: 8 }}>
                  {req.status === 'pending' ? (
                    <div style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #f59e0b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(req), fontFamily: 'monospace' }}>
                      {req.responseStatus || (req.status === 'error' ? 'ERR' : '—')}
                    </span>
                  )}
                </div>

                {/* Method */}
                <div style={{ width: 60, paddingRight: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: methodColor(req.method), letterSpacing: 0.5, fontFamily: 'monospace' }}>
                    {req.method}
                  </span>
                </div>

                {/* Type badge */}
                <div style={{ width: 80, paddingRight: 8 }}>
                  <span style={{
                    fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 700, letterSpacing: 0.5,
                    background: req.type === 'websocket' ? '#083344' : req.type === 'native_http' ? '#1c1435' : '#1a1a2e',
                    color: req.type === 'websocket' ? '#22d3ee' : req.type === 'native_http' ? '#a78bfa' : '#6b7280',
                    textTransform: 'uppercase',
                  }}>
                    {req.type === 'native_http' ? 'native' : req.type}
                  </span>
                </div>

                {/* URL */}
                <div style={{ flex: 1, paddingRight: 8, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {shortUrl(req.url)}
                  </div>
                  <div style={{ fontSize: 10, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {new URL(req.url).host}
                  </div>
                </div>

                {/* Duration */}
                <div style={{ width: 70, textAlign: 'right', paddingRight: 8, fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                  {formatDuration(req.duration)}
                </div>

                {/* Size */}
                <div style={{ width: 70, textAlign: 'right', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                  {formatSize(req.responseSize)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        {selectedReq && (
          <RequestDetail req={selectedReq} onClose={() => setSelected(null)} />
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0d14; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #374151; }
        select option { background: #1f2937; }
      `}</style>
    </div>
  );
}
