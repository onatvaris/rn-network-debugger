/**
 * fetch() interceptor
 *
 * Global fetch'i monkey-patch ederek tüm istekleri yakalar.
 * React Native'de fetch, Hermes/JavaScriptCore üzerinde polyfill olarak çalışır.
 */

import { getNativeCookies } from '../cookies';

export function interceptFetch(emitter) {
  if (typeof global.fetch !== 'function') return;

  const originalFetch = global.fetch;

  global.fetch = async function interceptedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init.method || (typeof input === 'object' ? input.method : undefined) || 'GET';
    const headers = normalizeHeaders(init.headers || (typeof input === 'object' ? input.headers : {}));
    const body = init.body || (typeof input === 'object' ? input.body : undefined);

    if (!Object.keys(headers).some(k => k.toLowerCase() === 'cookie')) {
      const cookieStr = await getNativeCookies(url);
      if (cookieStr) headers['cookie'] = cookieStr;
    }

    const id = emitter.onRequestStart({ url, method, headers, body, type: 'fetch' });

    try {
      const response = await originalFetch(input, init);

      // Response body'yi okumak için clone'la (stream bir kez okunabilir)
      const cloned = response.clone();
      let responseBody = null;
      let responseSize = 0;

      try {
        const text = await cloned.text();
        responseSize = text.length;
        try { responseBody = JSON.parse(text); } catch { responseBody = text; }
      } catch {
        responseBody = '[Okunamadı]';
      }

      const responseHeaders = {};
      response.headers?.forEach?.((value, key) => {
        responseHeaders[key] = value;
      });

      emitter.onRequestDone(id, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        size: responseSize,
      });

      return response;
    } catch (error) {
      emitter.onRequestError(id, error);
      throw error;
    }
  };

  global.fetch._original = originalFetch;
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === 'function') {
    const result = {};
    headers.forEach((v, k) => { result[k] = v; });
    return result;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}
