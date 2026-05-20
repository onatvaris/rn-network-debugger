import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Cookie Store ─────────────────────────────────────────────────────────────
// Structure: { platform: { domain: { name: value } } }
// Platform is read from x-app-device header → 'android' | 'ios' | 'unknown'

function getPlatform(req) {
  const headers = req?.headers || {};
  const device = Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-app-device')?.[1];
  if (device) {
    const d = device.toLowerCase();
    if (d.includes('android')) return 'android';
    if (d.includes('ios')) return 'ios';
  }
  const ua = Object.entries(headers).find(([k]) => k.toLowerCase() === 'user-agent')?.[1] || '';
  if (ua.toLowerCase().includes('okhttp')) return 'android';
  if (ua.toLowerCase().includes('cfnetwork') || ua.toLowerCase().includes('darwin')) return 'ios';
  return 'unknown';
}

function parseSetCookie(setCookieStr, requestUrl, platform, setCookieStore) {
  try {
    const parts = setCookieStr.split(';').map(p => p.trim());
    const eqIdx = parts[0].indexOf('=');
    if (eqIdx < 0) return;
    const name = parts[0].substring(0, eqIdx).trim();
    const value = parts[0].substring(eqIdx + 1).trim();

    const domainPart = parts.find(p => p.toLowerCase().startsWith('domain='));
    const domain = domainPart
      ? domainPart.split('=')[1].trim().replace(/^\./, '')
      : new URL(requestUrl).hostname;

    const maxAgePart = parts.find(p => p.toLowerCase().startsWith('max-age='));
    if (maxAgePart && parseInt(maxAgePart.split('=')[1]) <= 0) {
      setCookieStore(prev => {
        const plat = { ...(prev[platform] || {}) };
        const dom = { ...(plat[domain] || {}) };
        delete dom[name];
        return { ...prev, [platform]: { ...plat, [domain]: dom } };
      });
      return;
    }

    setCookieStore(prev => ({
      ...prev,
      [platform]: {
        ...(prev[platform] || {}),
        [domain]: { ...(prev[platform]?.[domain] || {}), [name]: value },
      },
    }));
  } catch {}
}

function extractSetCookies(req, setCookieStore) {
  if (!req?.responseHeaders || !req?.url) return;
  const platform = getPlatform(req);
  Object.entries(req.responseHeaders).forEach(([k, v]) => {
    if (k.toLowerCase() === 'set-cookie') {
      String(v).split('\n').forEach(line => {
        if (line.trim()) parseSetCookie(line.trim(), req.url, platform, setCookieStore);
      });
    }
  });
}

function getCookiesForUrl(cookieStore, url, platform) {
  try {
    const hostname = new URL(url).hostname;
    const platStore = cookieStore[platform] || cookieStore['unknown'] || {};
    const matched = {};
    Object.entries(platStore).forEach(([domain, cookies]) => {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        Object.assign(matched, cookies);
      }
    });
    const entries = Object.entries(matched);
    if (!entries.length) return null;
    return entries.map(([n, v]) => `${n}=${v}`).join('; ');
  } catch {
    return null;
  }
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

function useDebuggerConnection() {
  const [requests, setRequests] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connectedApps, setConnectedApps] = useState(0);
  const [cookieStore, setCookieStore] = useState({});
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
          const reqs = {};
          msg.data.forEach(item => processMessage(item, reqs));
          const sorted = Object.values(reqs).sort((a, b) => a.startTime - b.startTime);
          setRequests(sorted);
          sorted.forEach(req => extractSetCookies(req, setCookieStore));
          return;
        }
        if (msg.event === 'history_cleared') { setRequests([]); return; }
        if (msg.event === 'server:status') { setConnectedApps(msg.data.connectedApps); return; }
        if (msg.event === 'request:done') extractSetCookies(msg.data, setCookieStore);
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
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const clearAll = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'clear_history' }));
    setRequests([]);
  }, []);

  return { requests, connected, connectedApps, cookieStore, setCookieStore, clearAll };
}

function processMessage(msg, map) {
  if (!msg?.data?.id) return;
  const { event, data } = msg;
  if (event === 'request:start') {
    map[data.id] = { ...data };
  } else if (event === 'request:done' || event === 'request:error' || event === 'request:update') {
    map[data.id] = { ...(map[data.id] || {}), ...data };
  } else if (event === 'ws:message') {
    const req = map[data.id];
    if (req) map[data.id] = { ...req, wsMessages: [...(req.wsMessages || []), data] };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const map = { GET: '#60a5fa', POST: '#a78bfa', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#f97316', WS: '#22d3ee' };
  return map[method] || '#9ca3af';
}

function platformColor(platform) {
  if (platform === 'android') return '#22c55e';
  if (platform === 'ios') return '#60a5fa';
  return '#6b7280';
}

function platformLabel(platform) {
  if (platform === 'android') return 'Android';
  if (platform === 'ios') return 'iOS';
  return null;
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
  try { const u = new URL(url); return u.pathname + u.search; } catch { return url; }
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

function getThresholdColor(value, rules) {
  if (!value || !rules?.length) return null;
  for (const rule of rules) {
    const min = rule.min ?? 0;
    const max = rule.max ?? Infinity;
    if (value >= min && value <= max) return rule.color;
  }
  return null;
}

function useThresholds() {
  const [thresholds, setThresholds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rn-debugger-thresholds') || 'null')
        || { duration: [], size: [] };
    } catch {
      return { duration: [], size: [] };
    }
  });

  useEffect(() => {
    localStorage.setItem('rn-debugger-thresholds', JSON.stringify(thresholds));
  }, [thresholds]);

  const addRule = useCallback((field, rule) => {
    setThresholds(prev => ({
      ...prev,
      [field]: [...prev[field], { id: Date.now(), ...rule }],
    }));
  }, []);

  const deleteRule = useCallback((field, id) => {
    setThresholds(prev => ({
      ...prev,
      [field]: prev[field].filter(r => r.id !== id),
    }));
  }, []);

  return { thresholds, addRule, deleteRule };
}

function ThresholdManager({ thresholds, addRule, deleteRule, onClose }) {
  const emptyForm = { min: '', max: '', color: '#ef4444' };
  const [durationForm, setDurationForm] = useState(emptyForm);
  const [sizeForm, setSizeForm] = useState(emptyForm);

  const handleAdd = (field, form, setForm) => {
    const min = form.min === '' ? 0 : Number(form.min);
    const max = form.max === '' ? null : Number(form.max);
    if (isNaN(min)) return;
    addRule(field, { min, max, color: form.color });
    setForm(emptyForm);
  };

  const formatRuleLabel = (rule, field) => {
    const unit = field === 'duration' ? 'ms' : 'B';
    if (rule.max == null) return `≥ ${rule.min}${unit}`;
    return `${rule.min}${unit} – ${rule.max}${unit}`;
  };

  const renderSection = (field, label, form, setForm) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>{label}</div>

      {thresholds[field].length === 0 && (
        <div style={{ color: '#374151', fontSize: 12, marginBottom: 12 }}>No rules yet</div>
      )}
      {thresholds[field].map(rule => (
        <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: '#0a0d14', border: '1px solid #1f2937' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: rule.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: rule.color }}>{formatRuleLabel(rule, field)}</span>
          <button onClick={() => deleteRule(field, rule.id)}
            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>✕</button>
        </div>
      ))}

      {/* Add form */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <input
          value={form.min} onChange={e => setForm(f => ({ ...f, min: e.target.value }))}
          placeholder={`Min (${field === 'duration' ? 'ms' : 'bytes'})`}
          style={{ width: 110, background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }} />
        <span style={{ color: '#4b5563', fontSize: 12 }}>–</span>
        <input
          value={form.max} onChange={e => setForm(f => ({ ...f, max: e.target.value }))}
          placeholder="Max (optional)"
          style={{ width: 110, background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }} />
        <input
          type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          style={{ width: 36, height: 30, padding: 2, background: '#1f2937', border: '1px solid #374151', borderRadius: 5, cursor: 'pointer' }} />
        <button onClick={() => handleAdd(field, form, setForm)}
          style={{ background: '#1d4ed8', border: 'none', borderRadius: 5, color: '#fff', padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Add</button>
      </div>
      <div style={{ fontSize: 10, color: '#374151', marginTop: 6 }}>
        {field === 'duration' ? 'Values in milliseconds. Leave Max empty for "≥ Min".' : 'Values in bytes (1 KB = 1024). Leave Max empty for "≥ Min".'}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 480, height: '100vh', background: '#0f1117', borderLeft: '1px solid #1f2937', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>Color Thresholds</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {renderSection('duration', 'Duration', durationForm, setDurationForm)}
          {renderSection('size', 'Response Size', sizeForm, setSizeForm)}
        </div>
      </div>
    </div>
  );
}

function buildCurlCommand(req, cookieStore = {}) {
  const platform = getPlatform(req);
  const lines = [`curl -X ${req.method}`];
  const headers = { ...(req.headers || {}) };

  const hasCookie = Object.keys(headers).some(k => k.toLowerCase() === 'cookie');
  if (!hasCookie) {
    const cookieStr = getCookiesForUrl(cookieStore, req.url, platform);
    if (cookieStr) headers['cookie'] = cookieStr;
  }

  Object.entries(headers).forEach(([k, v]) => {
    lines.push(`  -H "${k}: ${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  });

  const body = req.body;
  if (body !== null && body !== undefined) {
    if (body?._type === 'FormData') {
      Object.entries(body.entries || {}).forEach(([k, v]) => {
        const str = String(v);
        const uriMatch = str.match(/uri: (.+?)\]/);
        lines.push(uriMatch
          ? `  --form "${k}=@${uriMatch[1]}"`
          : `  --form "${k}=${str.replace(/"/g, '\\"')}"`);
      });
    } else {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      lines.push(`  --data-raw '${raw.replace(/'/g, "'\\''")}'`);
    }
  }

  lines.push(`  --compressed`);
  lines.push(`  "${req.url}"`);
  return lines.join(' \\\n');
}

// ─── Components ──────────────────────────────────────────────────────────────

function FormDataView({ data }) {
  const entries = Object.entries(data.entries || {});
  if (!entries.length) return <span style={{ color: '#6b7280', fontSize: 12 }}>Empty FormData</span>;
  return (
    <div>
      <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
        FormData ({entries.length} {entries.length === 1 ? 'field' : 'fields'})
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
          <span style={{ color: '#60a5fa', fontSize: 12, fontFamily: 'monospace', minWidth: 160, flexShrink: 0 }}>{k}:</span>
          <span style={{ color: typeof v === 'string' && v.startsWith('[File:') ? '#f59e0b' : '#d1d5db', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

function JsonView({ data }) {
  if (data === null || data === undefined) return <span style={{ color: '#6b7280' }}>null</span>;
  if (data?._type === 'FormData') return <FormDataView data={data} />;
  if (typeof data === 'string') {
    return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d1d5db', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>{data}</pre>;
  }
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d1d5db', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ background: copied ? '#14532d' : '#1f2937', border: `1px solid ${copied ? '#16a34a' : '#374151'}`, borderRadius: 5, color: copied ? '#22c55e' : '#9ca3af', padding: '4px 10px', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ─── Cookie Manager Panel ─────────────────────────────────────────────────────

function CookieManager({ cookieStore, setCookieStore, onClose }) {
  const [editingKey, setEditingKey] = useState(null); // 'platform|domain|name'
  const [editValue, setEditValue] = useState('');
  const emptyAdd = { platform: 'ios', domain: '', name: '', value: '' };
  const [addForm, setAddForm] = useState(emptyAdd);
  const [showAdd, setShowAdd] = useState(false);

  const submitAdd = () => {
    const { platform, domain, name, value } = addForm;
    if (!domain.trim() || !name.trim()) return;
    setCookieStore(prev => ({
      ...prev,
      [platform]: {
        ...(prev[platform] || {}),
        [domain.trim()]: { ...(prev[platform]?.[domain.trim()] || {}), [name.trim()]: value },
      },
    }));
    setAddForm(emptyAdd);
    setShowAdd(false);
  };

  const totalCount = Object.values(cookieStore).reduce((sum, domains) =>
    sum + Object.values(domains).reduce((s, cookies) => s + Object.keys(cookies).length, 0), 0);

  const deleteCookie = (platform, domain, name) => {
    setCookieStore(prev => {
      const p = { ...(prev[platform] || {}) };
      const d = { ...(p[domain] || {}) };
      delete d[name];
      if (!Object.keys(d).length) delete p[domain];
      if (!Object.keys(p).length) { const next = { ...prev }; delete next[platform]; return next; }
      return { ...prev, [platform]: { ...p, [domain]: d } };
    });
  };

  const deleteDomain = (platform, domain) => {
    setCookieStore(prev => {
      const p = { ...(prev[platform] || {}) };
      delete p[domain];
      if (!Object.keys(p).length) { const next = { ...prev }; delete next[platform]; return next; }
      return { ...prev, [platform]: p };
    });
  };

  const saveEdit = (platform, domain, name) => {
    setCookieStore(prev => ({
      ...prev,
      [platform]: { ...(prev[platform] || {}), [domain]: { ...(prev[platform]?.[domain] || {}), [name]: editValue } },
    }));
    setEditingKey(null);
  };

  const platforms = Object.keys(cookieStore);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, height: '100vh', background: '#0f1117', borderLeft: '1px solid #1f2937', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>Cookie Store</span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>{totalCount} cookie{totalCount !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(s => !s)} style={{ background: showAdd ? '#1a2a4a' : '#1f2937', border: `1px solid ${showAdd ? '#3b82f6' : '#374151'}`, borderRadius: 5, color: showAdd ? '#60a5fa' : '#9ca3af', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>+ Add</button>
            <button onClick={() => setCookieStore({})} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#9ca3af', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Clear All</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Add Cookie Form */}
        {showAdd && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', background: '#0a0d14', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={addForm.platform} onChange={e => setAddForm(f => ({ ...f, platform: e.target.value }))}
                style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: platformColor(addForm.platform), padding: '5px 8px', fontSize: 12, outline: 'none', flexShrink: 0 }}>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
                <option value="unknown">Unknown</option>
              </select>
              <input value={addForm.domain} onChange={e => setAddForm(f => ({ ...f, domain: e.target.value }))} placeholder="domain (e.g. example.com)"
                style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="name"
                style={{ flex: '0 0 35%', background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#60a5fa', padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'monospace' }} />
              <input value={addForm.value} onChange={e => setAddForm(f => ({ ...f, value: e.target.value }))} placeholder="value"
                onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setShowAdd(false); }}
                style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#9ca3af', padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'monospace' }} />
              <button onClick={submitAdd} disabled={!addForm.domain.trim() || !addForm.name.trim()}
                style={{ background: '#1d4ed8', border: 'none', borderRadius: 5, color: '#fff', padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: (!addForm.domain.trim() || !addForm.name.trim()) ? 0.5 : 1, flexShrink: 0 }}>Save</button>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {platforms.length === 0 ? (
            <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No cookies captured yet</div>
          ) : (
            platforms.map(platform => (
              <div key={platform} style={{ marginBottom: 24 }}>
                {/* Platform header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: platformColor(platform), background: `${platformColor(platform)}22`, padding: '2px 8px', borderRadius: 3 }}>
                    {platformLabel(platform) || platform}
                  </span>
                </div>

                {Object.entries(cookieStore[platform] || {}).map(([domain, cookies]) => (
                  <div key={domain} style={{ marginBottom: 16, background: '#0a0d14', borderRadius: 8, border: '1px solid #1f2937', overflow: 'hidden' }}>
                    {/* Domain header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #1f2937', background: '#0d1019' }}>
                      <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600 }}>{domain}</span>
                      <button onClick={() => deleteDomain(platform, domain)}
                        style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}>
                        Delete all
                      </button>
                    </div>

                    {/* Cookies */}
                    {Object.entries(cookies).map(([name, value]) => {
                      const key = `${platform}|${domain}|${name}`;
                      const isEditing = editingKey === key;
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 12px', borderBottom: '1px solid #111827' }}>
                          <span style={{ color: '#60a5fa', fontSize: 11, fontFamily: 'monospace', minWidth: 140, flexShrink: 0, paddingTop: 2 }}>{name}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(platform, domain, name); if (e.key === 'Escape') setEditingKey(null); }}
                                  autoFocus
                                  style={{ flex: 1, background: '#1f2937', border: '1px solid #3b82f6', borderRadius: 4, color: '#e2e8f0', padding: '3px 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                                <button onClick={() => saveEdit(platform, domain, name)}
                                  style={{ background: '#1d4ed8', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Save</button>
                                <button onClick={() => setEditingKey(null)}
                                  style={{ background: '#1f2937', border: 'none', borderRadius: 4, color: '#9ca3af', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}
                                title={value}>{value.length > 60 ? value.substring(0, 60) + '…' : value}</span>
                            )}
                          </div>
                          {!isEditing && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => { setEditingKey(key); setEditValue(value); }}
                                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>Edit</button>
                              <button onClick={() => deleteCookie(platform, domain, name)}
                                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Request Detail ───────────────────────────────────────────────────────────

function ReplayTab({ req }) {
  const [method, setMethod] = useState(req.method || 'GET');
  const [url, setUrl] = useState(req.url || '');
  const [headers, setHeaders] = useState(() =>
    Object.entries(req.headers || {}).map(([k, v]) => ({ k, v, id: Math.random() }))
  );
  const [body, setBody] = useState(() => {
    if (!req.body) return '';
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2);
  });
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);

  const addHeader = () => setHeaders(h => [...h, { k: '', v: '', id: Math.random() }]);
  const removeHeader = (id) => setHeaders(h => h.filter(x => x.id !== id));
  const updateHeader = (id, field, val) => setHeaders(h => h.map(x => x.id === id ? { ...x, [field]: val } : x));

  const send = async () => {
    setSending(true);
    setResponse(null);
    try {
      const headersObj = {};
      headers.forEach(({ k, v }) => { if (k.trim()) headersObj[k.trim()] = v; });
      let parsedBody = body.trim() || null;
      if (parsedBody) { try { parsedBody = JSON.parse(parsedBody); } catch {} }

      const res = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, url, headers: headersObj, body: parsedBody }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  const inputStyle = { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: '#e2e8f0', padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' };
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Method + URL */}
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={method} onChange={e => setMethod(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 5, color: methodColor(method), padding: '6px 8px', fontSize: 12, outline: 'none', fontWeight: 700, flexShrink: 0 }}>
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={url} onChange={e => setUrl(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="https://…" />
      </div>

      {/* Headers */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase' }}>Headers</span>
          <button onClick={addHeader} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 4, color: '#9ca3af', padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>+ Add</button>
        </div>
        {headers.map(({ k, v, id }) => (
          <div key={id} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
            <input value={k} onChange={e => updateHeader(id, 'k', e.target.value)} placeholder="Key"
              style={{ ...inputStyle, flex: '0 0 40%' }} />
            <input value={v} onChange={e => updateHeader(id, 'v', e.target.value)} placeholder="Value"
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => removeHeader(id)}
              style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Body */}
      {method !== 'GET' && method !== 'HEAD' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Body</div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder='{"key": "value"}'
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      )}

      {/* Send */}
      <button onClick={send} disabled={sending || !url.trim()}
        style={{ background: sending ? '#1e3a5f' : '#1d4ed8', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: !url.trim() ? 0.5 : 1 }}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {/* Response */}
      {response && (
        <div style={{ borderTop: '1px solid #1f2937', paddingTop: 14 }}>
          {response.error ? (
            <div style={{ color: '#ef4444', fontSize: 12, fontFamily: 'monospace' }}>{response.error}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: response.status < 400 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{response.status} {response.statusText}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{formatDuration(response.duration)}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{formatSize(response.size)}</span>
                <div style={{ marginLeft: 'auto' }}>
                  <CopyButton text={typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)} label="Copy Body" />
                </div>
              </div>
              <JsonView data={response.body} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RequestDetail({ req, onClose, cookieStore }) {
  const [tab, setTab] = useState('response');
  if (!req) return null;

  const tabs = ['response', 'request', 'headers', 'timing'];
  if (req.type === 'websocket') tabs.push('messages');
  if (req.type !== 'websocket') tabs.push('replay');

  const platform = getPlatform(req);
  const platLabel = platformLabel(platform);

  return (
    <div style={{ width: '45%', borderLeft: '1px solid #1f2937', display: 'flex', flexDirection: 'column', background: '#0f1117', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ color: methodColor(req.method), fontWeight: 700, fontSize: 11, letterSpacing: 1, fontFamily: 'monospace' }}>{req.method}</span>
            <span style={{ color: statusColor(req), fontSize: 11, fontWeight: 600 }}>{req.responseStatus || (req.status === 'pending' ? '…' : req.status)}</span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>{formatDuration(req.duration)}</span>
            {platLabel && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700, background: `${platformColor(platform)}22`, color: platformColor(platform) }}>{platLabel}</span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <CopyButton text={buildCurlCommand(req, cookieStore)} label="Copy as cURL" />
            </div>
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
            color: tab === t ? '#e2e8f0' : '#6b7280', padding: '8px 12px', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'response' && (
          req.error
            ? <div style={{ color: '#ef4444', fontSize: 13, fontFamily: 'monospace' }}>{req.error}</div>
            : req.responseBody !== undefined
              ? <JsonView data={req.responseBody} />
              : <span style={{ color: '#6b7280', fontSize: 12 }}>Waiting for response…</span>
        )}

        {tab === 'request' && (
          req.body !== undefined && req.body !== null
            ? <JsonView data={req.body} />
            : <span style={{ color: '#6b7280', fontSize: 12 }}>No request body</span>
        )}

        {tab === 'headers' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Request Headers</div>
              {Object.entries(req.headers || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: '#60a5fa', fontSize: 12, fontFamily: 'monospace', minWidth: 180 }}>{k}:</span>
                  <span style={{ color: '#d1d5db', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
            {req.responseHeaders && Object.keys(req.responseHeaders).length > 0 && (
              <div>
                <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Response Headers</div>
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
              { label: 'Start', value: req.startTime ? new Date(req.startTime).toLocaleTimeString() : '—' },
              { label: 'End', value: req.endTime ? new Date(req.endTime).toLocaleTimeString() : '—' },
              { label: 'Duration', value: formatDuration(req.duration) },
              { label: 'Response Size', value: formatSize(req.responseSize) },
              { label: 'Type', value: req.type },
              { label: 'Platform', value: platLabel || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{label}</span>
                <span style={{ color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'messages' && (
          (req.wsMessages || []).length === 0
            ? <span style={{ color: '#6b7280', fontSize: 12 }}>No messages yet</span>
            : (req.wsMessages || []).map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: msg.direction === 'send' ? '#1e3a5f' : msg.direction === 'receive' ? '#1a3a2a' : '#2a1a1a', border: `1px solid ${msg.direction === 'send' ? '#2563eb33' : msg.direction === 'receive' ? '#16a34a33' : '#ef444433'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: msg.direction === 'send' ? '#60a5fa' : msg.direction === 'receive' ? '#22c55e' : '#ef4444', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {msg.direction === 'send' ? '↑ Sent' : msg.direction === 'receive' ? '↓ Received' : '✕ Closed'}
                  </span>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <JsonView data={msg.data} />
              </div>
            ))
        )}

        {tab === 'replay' && <ReplayTab req={req} />}
      </div>
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({ requests, selected, onSelect, thresholds }) {
  const LABEL_W = 280;

  if (requests.length === 0) return null;

  const minTime = Math.min(...requests.map(r => r.startTime));
  const rawMax = Math.max(...requests.map(r => r.endTime || (r.startTime + (r.duration || 0))));
  const maxTime = rawMax > minTime ? rawMax : minTime + 1000;
  const span = maxTime - minTime;

  const niceInterval = (() => {
    const candidates = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000];
    return candidates.find(c => span / c <= 7) || candidates[candidates.length - 1];
  })();

  const ticks = [];
  const firstTick = Math.ceil(minTime / niceInterval) * niceInterval;
  for (let t = firstTick; t <= maxTime; t += niceInterval) ticks.push(t);

  const toPercent = (t) => ((t - minTime) / span) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Axis header */}
      <div style={{ display: 'flex', flexShrink: 0, height: 32, background: '#0d1019', borderBottom: '1px solid #1f2937', alignItems: 'stretch' }}>
        <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Request
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {ticks.map(t => (
            <div key={t} style={{ position: 'absolute', left: `${toPercent(t)}%`, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', pointerEvents: 'none' }}>
              <div style={{ flex: 1, borderLeft: '1px dashed #1f2937', width: 1 }} />
              <span style={{ fontSize: 9, color: '#4b5563', fontFamily: 'monospace', whiteSpace: 'nowrap', paddingBottom: 4, paddingLeft: 3 }}>
                {(t - minTime) < 1000 ? `+${t - minTime}ms` : `+${((t - minTime) / 1000).toFixed(1)}s`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {requests.map((req, idx) => {
          const barStart = toPercent(req.startTime);
          const barEnd = toPercent(req.endTime || (req.startTime + (req.duration || 0)));
          const barWidth = Math.max(barEnd - barStart, 0.3);
          const color = statusColor(req);
          const isPending = req.status === 'pending';
          const durationColor = getThresholdColor(req.duration, thresholds.duration) || '#6b7280';

          return (
            <div key={req.id} onClick={() => onSelect(req.id === selected ? null : req.id)}
              style={{ display: 'flex', alignItems: 'center', height: 36, cursor: 'pointer', borderBottom: '1px solid #111827', background: selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019' }}
              onMouseEnter={e => { if (selected !== req.id) e.currentTarget.style.background = '#151a27'; }}
              onMouseLeave={e => { e.currentTarget.style.background = selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019'; }}>

              {/* Label */}
              <div style={{ width: LABEL_W, flexShrink: 0, paddingLeft: 12, paddingRight: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: methodColor(req.method), fontFamily: 'monospace', flexShrink: 0 }}>{req.method}</span>
                  <span style={{ fontSize: 11, color: statusColor(req), fontFamily: 'monospace', flexShrink: 0 }}>{req.responseStatus || (req.status === 'pending' ? '…' : req.status === 'error' ? 'ERR' : '—')}</span>
                  <span style={{ fontSize: 11, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{shortUrl(req.url)}</span>
                </div>
                <div style={{ fontSize: 10, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => { try { return new URL(req.url).host; } catch { return ''; } })()}
                </div>
              </div>

              {/* Bar area */}
              <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
                {ticks.map(t => (
                  <div key={t} style={{ position: 'absolute', left: `${toPercent(t)}%`, top: 0, bottom: 0, borderLeft: '1px dashed #111827', pointerEvents: 'none' }} />
                ))}
                <div style={{
                  position: 'absolute',
                  top: '22%', height: '56%',
                  left: `${barStart}%`,
                  width: `${barWidth}%`,
                  background: isPending ? 'transparent' : color,
                  border: isPending ? `2px solid ${color}` : 'none',
                  borderRadius: 3,
                  minWidth: 4,
                  opacity: 0.85,
                }} />
                {req.duration != null && (() => {
                  const nearRight = barStart + barWidth > 82;
                  return (
                    <span style={{
                      position: 'absolute',
                      top: '50%', transform: 'translateY(-50%)',
                      ...(nearRight
                        ? { right: `${100 - barStart + 4}%` }
                        : { left: `calc(${barStart + barWidth}% + 4px)` }),
                      fontSize: 9, color: durationColor, fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      fontWeight: getThresholdColor(req.duration, thresholds.duration) ? 700 : 400,
                      pointerEvents: 'none',
                    }}>
                      {formatDuration(req.duration)}
                    </span>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Column Headers (shared between list and layout) ──────────────────────────

const COLUMNS = [
  { label: 'Status', w: 70 },
  { label: 'Method', w: 60 },
  { label: 'Type', w: 80 },
  { label: 'URL', flex: 1 },
  { label: 'Duration', w: 80, align: 'right' },
  { label: 'Size', w: 70, align: 'right' },
];

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const { requests, connected, connectedApps, cookieStore, setCookieStore, clearAll } = useDebuggerConnection();
  const { thresholds, addRule, deleteRule } = useThresholds();
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCookies, setShowCookies] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  const totalCookies = Object.values(cookieStore).reduce((sum, domains) =>
    sum + Object.values(domains).reduce((s, c) => s + Object.keys(c).length, 0), 0);

  const filtered = requests.filter(req => {
    if (filter && !req.url?.toLowerCase().includes(filter.toLowerCase())) return false;
    if (typeFilter !== 'all' && req.type !== typeFilter) return false;
    if (statusFilter === 'error' && req.status !== 'error' && (req.responseStatus < 400 || !req.responseStatus)) return false;
    if (statusFilter === 'success' && (req.status === 'error' || req.responseStatus >= 400)) return false;
    if (statusFilter === 'pending' && req.status !== 'pending') return false;
    return true;
  });

  const selectedReq = selected ? requests.find(r => r.id === selected) : null;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { setSelected(null); setShowCookies(false); setShowThresholds(false); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex(r => r.id === selected);
        if (e.key === 'ArrowDown') setSelected(filtered[Math.min(idx + 1, filtered.length - 1)]?.id ?? filtered[0]?.id);
        if (e.key === 'ArrowUp') setSelected(filtered[Math.max(idx - 1, 0)]?.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selected]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0d14', color: '#e2e8f0', fontFamily: '"Inter", -apple-system, sans-serif' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 48, background: '#0f1117', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>⬡</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', letterSpacing: 0.3 }}>RN Network Debugger</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', boxShadow: connected ? '0 0 6px #22c55e' : 'none' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {connected ? `${connectedApps} app${connectedApps !== 1 ? 's' : ''} connected` : 'Connecting…'}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 2, background: '#1f2937', borderRadius: 6, padding: 2 }}>
          {['list', 'timeline'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{ background: viewMode === mode ? '#374151' : 'transparent', border: 'none', borderRadius: 4, color: viewMode === mode ? '#e2e8f0' : '#6b7280', padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: viewMode === mode ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.1s' }}>
              {mode === 'list' ? '≡ List' : '▬ Timeline'}
            </button>
          ))}
        </div>

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by URL…"
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', padding: '5px 10px', fontSize: 12, width: 200, outline: 'none' }} />

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }}>
          <option value="all">All Types</option>
          <option value="fetch">fetch</option>
          <option value="xhr">XHR</option>
          <option value="axios">axios</option>
          <option value="native_http">Native HTTP</option>
          <option value="websocket">WebSocket</option>
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', padding: '5px 8px', fontSize: 12, outline: 'none' }}>
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>

        <button onClick={() => setShowThresholds(true)}
          style={{ background: (thresholds.duration.length + thresholds.size.length) > 0 ? '#1a1a3a' : '#1f2937', border: `1px solid ${(thresholds.duration.length + thresholds.size.length) > 0 ? '#3b82f6' : '#374151'}`, borderRadius: 6, color: (thresholds.duration.length + thresholds.size.length) > 0 ? '#60a5fa' : '#9ca3af', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
          ⚡ Thresholds
        </button>

        <button onClick={() => setShowCookies(true)}
          style={{ background: totalCookies > 0 ? '#1a1a3a' : '#1f2937', border: `1px solid ${totalCookies > 0 ? '#3b82f6' : '#374151'}`, borderRadius: 6, color: totalCookies > 0 ? '#60a5fa' : '#9ca3af', padding: '5px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          🍪 {totalCookies > 0 ? totalCookies : 'Cookies'}
        </button>

        <button onClick={clearAll} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
          🗑 Clear
        </button>

        <span style={{ fontSize: 11, color: '#4b5563' }}>{filtered.length} request{filtered.length !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>v{__UI_VERSION__}</span>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* List + Column Headers (together so widths stay in sync) */}
        <div style={{ flex: selectedReq ? '0 0 55%' : '1 1 100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Column Headers — list mode only */}
          {viewMode === 'list' && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: 32, background: '#0d1019', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
              {COLUMNS.map(col => (
                <div key={col.label} style={{ width: col.w, flex: col.flex, textAlign: col.align || 'left', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: 0.8, textTransform: 'uppercase', paddingRight: 8 }}>
                  {col.label}
                </div>
              ))}
            </div>
          )}

          {/* Request List / Timeline */}
          <div style={{ flex: 1, overflow: viewMode === 'timeline' ? 'hidden' : 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div style={{ fontSize: 40 }}>📡</div>
                <div style={{ color: '#4b5563', fontSize: 13 }}>
                  {requests.length === 0 ? 'Network requests from your RN app will appear here' : 'No requests match the filter'}
                </div>
                {!connected && <div style={{ color: '#6b7280', fontSize: 12 }}>Server connects automatically when Metro starts</div>}
              </div>
            ) : viewMode === 'timeline' ? (
              <TimelineView requests={filtered} selected={selected} onSelect={setSelected} thresholds={thresholds} />
            ) : (
              filtered.map((req, idx) => {
                const platform = getPlatform(req);
                const platLabel = platformLabel(platform);
                return (
                  <div key={req.id} onClick={() => setSelected(req.id === selected ? null : req.id)}
                    style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: 40, cursor: 'pointer', borderBottom: '1px solid #111827', background: selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (selected !== req.id) e.currentTarget.style.background = '#151a27'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected === req.id ? '#1e2433' : idx % 2 === 0 ? '#0a0d14' : '#0d1019'; }}>

                    {/* Status */}
                    <div style={{ width: 70, paddingRight: 8 }}>
                      {req.status === 'pending'
                        ? <div style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #f59e0b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        : <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(req), fontFamily: 'monospace' }}>{req.responseStatus || (req.status === 'error' ? 'ERR' : '—')}</span>
                      }
                    </div>

                    {/* Method */}
                    <div style={{ width: 60, paddingRight: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: methodColor(req.method), letterSpacing: 0.5, fontFamily: 'monospace' }}>{req.method}</span>
                    </div>

                    {/* Type */}
                    <div style={{ width: 80, paddingRight: 8 }}>
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 700, letterSpacing: 0.5, background: req.type === 'websocket' ? '#083344' : req.type === 'native_http' ? '#1c1435' : '#1a1a2e', color: req.type === 'websocket' ? '#22d3ee' : req.type === 'native_http' ? '#a78bfa' : '#6b7280', textTransform: 'uppercase' }}>
                        {req.type === 'native_http' ? 'native' : req.type}
                      </span>
                    </div>

                    {/* URL + host + platform */}
                    <div style={{ flex: 1, paddingRight: 8, overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{shortUrl(req.url)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{new URL(req.url).host}</span>
                        {platLabel && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: platformColor(platform), flexShrink: 0 }}>{platLabel}</span>
                        )}
                      </div>
                    </div>

                    {/* Duration */}
                    <div style={{ width: 80, textAlign: 'right', paddingRight: 8, fontSize: 11, fontFamily: 'monospace', color: getThresholdColor(req.duration, thresholds.duration) || '#6b7280', fontWeight: getThresholdColor(req.duration, thresholds.duration) ? 700 : 400 }}>
                      {formatDuration(req.duration)}
                    </div>

                    {/* Size */}
                    <div style={{ width: 70, textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: getThresholdColor(req.responseSize, thresholds.size) || '#6b7280', fontWeight: getThresholdColor(req.responseSize, thresholds.size) ? 700 : 400 }}>
                      {formatSize(req.responseSize)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedReq && <RequestDetail req={selectedReq} onClose={() => setSelected(null)} cookieStore={cookieStore} />}
      </div>

      {/* Cookie Manager */}
      {showCookies && <CookieManager cookieStore={cookieStore} setCookieStore={setCookieStore} onClose={() => setShowCookies(false)} />}

      {/* Threshold Manager */}
      {showThresholds && <ThresholdManager thresholds={thresholds} addRule={addRule} deleteRule={deleteRule} onClose={() => setShowThresholds(false)} />}

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
