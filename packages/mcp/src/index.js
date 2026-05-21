#!/usr/bin/env node
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { RequestStore } = require('./store.js');

const SERVER_URL = process.env.RN_DEBUGGER_URL || 'ws://localhost:8788/ui';

const store = new RequestStore();
store.connect(SERVER_URL);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'rn-network-debugger', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_requests',
      description: 'List captured network requests with optional filters. Returns URL, method, status code, duration, and type.',
      inputSchema: {
        type: 'object',
        properties: {
          method:       { type: 'string',  description: 'Filter by HTTP method (GET, POST, etc.)' },
          status:       { type: 'number',  description: 'Filter by HTTP response status code' },
          url_contains: { type: 'string',  description: 'Filter URLs containing this string' },
          type:         { type: 'string',  description: 'Filter by request type: fetch, xhr, axios, websocket' },
          limit:        { type: 'number',  description: 'Max results to return (default 50)' },
          only_errors:  { type: 'boolean', description: 'Only show failed/error requests' },
          min_duration: { type: 'number',  description: 'Only show requests slower than this (ms)' },
          max_duration: { type: 'number',  description: 'Only show requests faster than this (ms)' },
          since_seconds:{ type: 'number',  description: 'Only show requests from the last N seconds' },
        },
      },
    },
    {
      name: 'get_request',
      description: 'Get full details of a captured request including request/response headers and body.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Request ID (from list_requests)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'analyze_performance',
      description: 'Analyze performance of captured requests: slowest endpoints, error rates, stats by domain and endpoint pattern, status code distribution.',
      inputSchema: {
        type: 'object',
        properties: {
          url_contains: { type: 'string', description: 'Scope analysis to URLs containing this string' },
          top_n:        { type: 'number', description: 'How many slowest requests to show (default 10)' },
          group_by_pattern: { type: 'boolean', description: 'Group similar endpoints (replaces numeric IDs with :id). Default true.' },
        },
      },
    },
    {
      name: 'get_recent_requests',
      description: 'Get the most recently captured requests (useful for live monitoring).',
      inputSchema: {
        type: 'object',
        properties: {
          count:         { type: 'number', description: 'Number of recent requests (default 20, max 100)' },
          since_seconds: { type: 'number', description: 'Only show requests from the last N seconds' },
        },
      },
    },
    {
      name: 'server_status',
      description: 'Get the current status of the RN Network Debugger server: connection state, number of captured requests, connected apps.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'find_duplicates',
      description: 'Find duplicate or repeated requests — same URL called multiple times. Useful for detecting redundant API calls.',
      inputSchema: {
        type: 'object',
        properties: {
          url_contains:  { type: 'string',  description: 'Scope to URLs containing this string' },
          min_count:     { type: 'number',  description: 'Minimum number of calls to report (default 2)' },
          ignore_params: { type: 'boolean', description: 'Ignore query string when grouping URLs (default false)' },
        },
      },
    },
    {
      name: 'search_response_bodies',
      description: 'Search across all captured response bodies for a keyword or value. Useful for finding which endpoints return specific fields.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword:      { type: 'string',  description: 'Text to search for in response bodies' },
          url_contains: { type: 'string',  description: 'Limit search to URLs containing this string' },
          case_sensitive: { type: 'boolean', description: 'Case-sensitive search (default false)' },
        },
        required: ['keyword'],
      },
    },
    {
      name: 'export_har',
      description: 'Export captured requests in HAR (HTTP Archive) format. Compatible with Chrome DevTools, Charles, Postman, and other tools.',
      inputSchema: {
        type: 'object',
        properties: {
          url_contains: { type: 'string', description: 'Only export requests with URLs containing this string' },
          limit:        { type: 'number', description: 'Max number of requests to export (default 200)' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case 'list_requests':        return { content: [{ type: 'text', text: listRequests(args) }] };
    case 'get_request':          return { content: [{ type: 'text', text: getRequest(args) }] };
    case 'analyze_performance':  return { content: [{ type: 'text', text: analyzePerformance(args) }] };
    case 'get_recent_requests':  return { content: [{ type: 'text', text: getRecentRequests(args) }] };
    case 'server_status':        return { content: [{ type: 'text', text: serverStatus() }] };
    case 'find_duplicates':      return { content: [{ type: 'text', text: findDuplicates(args) }] };
    case 'search_response_bodies': return { content: [{ type: 'text', text: searchResponseBodies(args) }] };
    case 'export_har':           return { content: [{ type: 'text', text: exportHar(args) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ─── Tool Implementations ─────────────────────────────────────────────────────

function listRequests({ method, status, url_contains, type, limit = 50, only_errors, min_duration, max_duration, since_seconds } = {}) {
  let items = store.getAll();

  if (method)        items = items.filter(r => r.method === method.toUpperCase());
  if (status)        items = items.filter(r => r.responseStatus === status);
  if (url_contains)  items = items.filter(r => r.url && r.url.includes(url_contains));
  if (type)          items = items.filter(r => r.type === type);
  if (only_errors)   items = items.filter(r => r.status === 'error' || (r.responseStatus >= 400));
  if (min_duration)  items = items.filter(r => r.duration != null && r.duration >= min_duration);
  if (max_duration)  items = items.filter(r => r.duration != null && r.duration <= max_duration);
  if (since_seconds) {
    const cutoff = Date.now() - since_seconds * 1000;
    items = items.filter(r => r.startTime && r.startTime >= cutoff);
  }

  items = items.slice(-limit).reverse();

  if (!items.length) return 'No requests found matching the given filters.';

  const rows = items.map(r => {
    const statusCode = r.responseStatus ?? (r.status === 'pending' ? '…' : r.status === 'error' ? 'ERR' : '?');
    const duration = r.duration != null ? `${r.duration}ms` : '…';
    const url = truncate(r.url, 80);
    return `[${r.id}] ${r.method} ${statusCode} ${duration.padStart(7)} ${r.type.padEnd(9)} ${url}`;
  });

  return `Captured requests (${items.length}):\n\n` + rows.join('\n');
}

function getRequest({ id } = {}) {
  const r = store.getById(id);
  if (!r) return `Request "${id}" not found.`;

  const lines = [
    `ID:              ${r.id}`,
    `Type:            ${r.type}`,
    `Method:          ${r.method}`,
    `URL:             ${r.url}`,
    `Status:          ${r.status}`,
    `Response Status: ${r.responseStatus ?? 'N/A'} ${r.responseStatusText ?? ''}`,
    `Duration:        ${r.duration != null ? r.duration + 'ms' : 'N/A'}`,
    `Response Size:   ${r.responseSize != null ? r.responseSize + ' bytes' : 'N/A'}`,
    `Start Time:      ${r.startTime ? new Date(r.startTime).toISOString() : 'N/A'}`,
    '',
    '── Request Headers ──────────────────────────────────',
    formatHeaders(r.headers),
    '',
    '── Request Body ─────────────────────────────────────',
    formatBody(r.body),
    '',
    '── Response Headers ─────────────────────────────────',
    formatHeaders(r.responseHeaders),
    '',
    '── Response Body ────────────────────────────────────',
    formatBody(r.responseBody),
  ];

  if (r.error) {
    lines.push('', '── Error ─────────────────────────────────────────────', r.error);
  }

  return lines.join('\n');
}

function analyzePerformance({ url_contains, top_n = 10, group_by_pattern = true } = {}) {
  let items = store.getAll().filter(r => r.status === 'done');
  if (url_contains) items = items.filter(r => r.url && r.url.includes(url_contains));

  if (!items.length) return 'No completed requests to analyze yet.';

  const allItems = store.getAll();
  const withDuration = items.filter(r => r.duration != null);
  const durations = withDuration.map(r => r.duration);
  const errCount = allItems.filter(r =>
    r.status === 'error' || (r.responseStatus != null && r.responseStatus >= 400)
  ).length;

  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;

  // By domain
  const byDomain = {};
  items.forEach(r => {
    try {
      const domain = new URL(r.url).hostname;
      if (!byDomain[domain]) byDomain[domain] = { count: 0, totalDuration: 0, errors: 0 };
      byDomain[domain].count++;
      if (r.duration) byDomain[domain].totalDuration += r.duration;
      if (r.responseStatus >= 400) byDomain[domain].errors++;
    } catch {}
  });

  const domainRows = Object.entries(byDomain)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([domain, d]) => {
      const avgD = d.count ? Math.round(d.totalDuration / d.count) : 0;
      return `  ${domain.padEnd(40)} ${String(d.count).padStart(5)} reqs  avg ${avgD}ms  ${d.errors} errors`;
    });

  // By endpoint pattern
  const patternRows = [];
  if (group_by_pattern) {
    const byPattern = {};
    items.forEach(r => {
      try {
        const u = new URL(r.url);
        const pattern = u.pathname.replace(/\/\d+/g, '/:id').replace(/[a-f0-9]{24,}/gi, ':hash');
        const key = `${r.method} ${u.hostname}${pattern}`;
        if (!byPattern[key]) byPattern[key] = { count: 0, totalDuration: 0, errors: 0 };
        byPattern[key].count++;
        if (r.duration) byPattern[key].totalDuration += r.duration;
        if (r.responseStatus >= 400) byPattern[key].errors++;
      } catch {}
    });

    Object.entries(byPattern)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .forEach(([pattern, d]) => {
        const avgD = d.count ? Math.round(d.totalDuration / d.count) : 0;
        patternRows.push(`  ${String(d.count).padStart(4)}x  avg ${String(avgD).padStart(6)}ms  ${d.errors > 0 ? `⚠ ${d.errors} err  ` : '          '}${truncate(pattern, 65)}`);
      });
  }

  // Status distribution
  const byStatus = {};
  allItems.forEach(r => {
    const key = r.responseStatus ?? r.status;
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  const statusRows = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `  ${String(s).padEnd(10)} ${c}`);

  // Slowest
  const slowest = [...withDuration]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, top_n)
    .map((r, i) => `  ${i + 1}. ${String(r.duration).padStart(6)}ms  ${r.method} ${r.responseStatus ?? '?'}  ${truncate(r.url, 65)}`);

  const lines = [
    '── Summary ───────────────────────────────────────────────',
    `Total requests:  ${allItems.length}`,
    `Completed:       ${items.length}`,
    `Errors:          ${errCount} (${allItems.length ? Math.round(errCount / allItems.length * 100) : 0}%)`,
    '',
    '── Latency ───────────────────────────────────────────────',
    `Average:  ${avg}ms`,
    `P50:      ${p50}ms`,
    `P95:      ${p95}ms`,
    `P99:      ${p99}ms`,
    '',
    `── Slowest ${top_n} Requests ──────────────────────────────`,
    ...slowest,
    '',
    '── By Endpoint Pattern ───────────────────────────────────',
    ...(patternRows.length ? patternRows : ['  (set group_by_pattern: true to enable)']),
    '',
    '── By Domain ─────────────────────────────────────────────',
    ...domainRows,
    '',
    '── Status Code Distribution ──────────────────────────────',
    ...statusRows,
  ];

  return lines.join('\n');
}

function getRecentRequests({ count = 20, since_seconds } = {}) {
  const n = Math.min(count, 100);
  let items = store.getRecent(n);

  if (since_seconds) {
    const cutoff = Date.now() - since_seconds * 1000;
    items = items.filter(r => r.startTime && r.startTime >= cutoff);
  }

  if (!items.length) return 'No requests captured yet.';

  const rows = items.map(r => {
    const statusCode = r.responseStatus ?? (r.status === 'pending' ? '…' : r.status === 'error' ? 'ERR' : '?');
    const duration = r.duration != null ? `${r.duration}ms` : '…';
    const time = r.startTime ? new Date(r.startTime).toLocaleTimeString() : '';
    const url = truncate(r.url, 75);
    return `[${time}] [${r.id}] ${r.method} ${statusCode} ${duration.padStart(7)} ${url}`;
  });

  const connected = store.connected ? 'connected' : 'disconnected (server may be offline)';
  return `Recent requests (${items.length}) — debugger server: ${connected}\n\n` + rows.join('\n');
}

function serverStatus() {
  const all = store.getAll();
  const done = all.filter(r => r.status === 'done').length;
  const pending = all.filter(r => r.status === 'pending').length;
  const errors = all.filter(r => r.status === 'error' || (r.responseStatus != null && r.responseStatus >= 400)).length;

  const lines = [
    '── RN Network Debugger — Server Status ───────────────────',
    `Debugger server:   ${store.connected ? '● connected' : '○ disconnected'} (${store.serverUrl})`,
    '',
    '── Captured Requests ─────────────────────────────────────',
    `Total:    ${all.length}`,
    `Done:     ${done}`,
    `Pending:  ${pending}`,
    `Errors:   ${errors}`,
  ];

  if (all.length > 0) {
    const oldest = all[0];
    const newest = all[all.length - 1];
    lines.push('');
    lines.push(`Oldest:   ${oldest.startTime ? new Date(oldest.startTime).toISOString() : 'N/A'}`);
    lines.push(`Newest:   ${newest.startTime ? new Date(newest.startTime).toISOString() : 'N/A'}`);
  }

  if (!store.connected) {
    lines.push('');
    lines.push('⚠ Not connected. Make sure Metro is running and the debugger server is up.');
    lines.push(`  Expected: ${store.serverUrl}`);
  }

  return lines.join('\n');
}

function findDuplicates({ url_contains, min_count = 2, ignore_params = false } = {}) {
  let items = store.getAll().filter(r => r.url);
  if (url_contains) items = items.filter(r => r.url.includes(url_contains));

  const groups = {};
  items.forEach(r => {
    let key;
    try {
      const u = new URL(r.url);
      key = ignore_params
        ? `${r.method} ${u.hostname}${u.pathname}`
        : `${r.method} ${r.url}`;
    } catch {
      key = `${r.method} ${r.url}`;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const duplicates = Object.entries(groups)
    .filter(([, reqs]) => reqs.length >= min_count)
    .sort((a, b) => b[1].length - a[1].length);

  if (!duplicates.length) return `No duplicate requests found (min_count: ${min_count}).`;

  const lines = [`Duplicate requests (called ${min_count}+ times):\n`];

  duplicates.forEach(([key, reqs]) => {
    const durations = reqs.filter(r => r.duration != null).map(r => r.duration);
    const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const errCount = reqs.filter(r => r.status === 'error' || r.responseStatus >= 400).length;
    lines.push(`  ${String(reqs.length).padStart(3)}x  ${avgDur != null ? `avg ${avgDur}ms` : '       '}  ${errCount > 0 ? `⚠ ${errCount} errors  ` : ''}${truncate(key, 70)}`);
    reqs.slice(0, 3).forEach(r => {
      const t = r.startTime ? new Date(r.startTime).toLocaleTimeString() : '';
      const s = r.responseStatus ?? (r.status === 'error' ? 'ERR' : '…');
      const d = r.duration != null ? `${r.duration}ms` : '…';
      lines.push(`       [${t}] ${s} ${d}  ${r.id}`);
    });
    if (reqs.length > 3) lines.push(`       … and ${reqs.length - 3} more`);
    lines.push('');
  });

  return lines.join('\n');
}

function searchResponseBodies({ keyword, url_contains, case_sensitive = false } = {}) {
  if (!keyword) return 'keyword is required.';

  let items = store.getAll().filter(r => r.responseBody != null);
  if (url_contains) items = items.filter(r => r.url && r.url.includes(url_contains));

  const needle = case_sensitive ? keyword : keyword.toLowerCase();

  const matches = items.filter(r => {
    try {
      const body = typeof r.responseBody === 'string'
        ? r.responseBody
        : JSON.stringify(r.responseBody);
      const haystack = case_sensitive ? body : body.toLowerCase();
      return haystack.includes(needle);
    } catch {
      return false;
    }
  });

  if (!matches.length) return `No response bodies contain "${keyword}".`;

  const lines = [`Found "${keyword}" in ${matches.length} response(s):\n`];

  matches.forEach(r => {
    const statusCode = r.responseStatus ?? '?';
    const duration = r.duration != null ? `${r.duration}ms` : '…';
    lines.push(`  [${r.id}] ${r.method} ${statusCode} ${duration}  ${truncate(r.url, 70)}`);

    // Show context around the match
    try {
      const body = typeof r.responseBody === 'string'
        ? r.responseBody
        : JSON.stringify(r.responseBody);
      const haystack = case_sensitive ? body : body.toLowerCase();
      const idx = haystack.indexOf(needle);
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(body.length, idx + keyword.length + 60);
        const snippet = body.slice(start, end).replace(/\n/g, ' ');
        lines.push(`    …${snippet}…`);
      }
    } catch {}
    lines.push('');
  });

  return lines.join('\n');
}

function exportHar({ url_contains, limit = 200 } = {}) {
  let items = store.getAll().filter(r => r.status === 'done');
  if (url_contains) items = items.filter(r => r.url && r.url.includes(url_contains));
  items = items.slice(-limit);

  const entries = items.map(r => {
    const reqHeaders = Object.entries(r.headers || {}).map(([name, value]) => ({ name, value: String(value) }));
    const resHeaders = Object.entries(r.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) }));

    const reqBodyStr = r.body != null
      ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
      : '';

    const resBodyStr = r.responseBody != null
      ? (typeof r.responseBody === 'string' ? r.responseBody : JSON.stringify(r.responseBody))
      : '';

    const contentType = (r.responseHeaders || {})['content-type'] || (r.responseHeaders || {})['Content-Type'] || 'text/plain';

    return {
      startedDateTime: r.startTime ? new Date(r.startTime).toISOString() : new Date().toISOString(),
      time: r.duration ?? 0,
      request: {
        method: r.method || 'GET',
        url: r.url || '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: reqHeaders,
        queryString: (() => {
          try {
            return [...new URL(r.url).searchParams.entries()].map(([name, value]) => ({ name, value }));
          } catch { return []; }
        })(),
        postData: reqBodyStr ? { mimeType: 'application/json', text: reqBodyStr } : undefined,
        headersSize: -1,
        bodySize: reqBodyStr ? reqBodyStr.length : 0,
      },
      response: {
        status: r.responseStatus ?? 0,
        statusText: r.responseStatusText ?? '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: resHeaders,
        content: {
          size: r.responseSize ?? resBodyStr.length,
          mimeType: contentType,
          text: resBodyStr,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: r.responseSize ?? resBodyStr.length,
      },
      cache: {},
      timings: { send: 0, wait: r.duration ?? 0, receive: 0 },
    };
  });

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'rn-network-debugger', version: '1.0.0' },
      entries,
    },
  };

  const json = JSON.stringify(har, null, 2);
  return `HAR export (${entries.length} requests):\n\n\`\`\`json\n${json.length > 50000 ? json.slice(0, 50000) + '\n…(truncated, use url_contains or limit to narrow down)' : json}\n\`\`\``;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatHeaders(headers) {
  if (!headers || !Object.keys(headers).length) return '  (none)';
  return Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n');
}

function formatBody(body) {
  if (body === null || body === undefined) return '  (none)';
  if (typeof body === 'string') return body.length > 2000 ? body.slice(0, 2000) + '\n…(truncated)' : body;
  try {
    const str = JSON.stringify(body, null, 2);
    return str.length > 4000 ? str.slice(0, 4000) + '\n…(truncated)' : str;
  } catch {
    return String(body);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
