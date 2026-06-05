/**
 * XMLHttpRequest interceptor
 *
 * React Native'de XHR, Networking.js tarafından native modüle köprülenir.
 * open(), send(), setRequestHeader() metodlarını wrap ederek istekleri yakalarız.
 */

import { getNativeCookies } from '../cookies.js';

export function interceptXHR(emitter) {
  if (typeof global.XMLHttpRequest === 'undefined') return;

  const OriginalXHR = global.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let _id = null;
    let _method = 'GET';
    let _url = '';
    let _requestHeaders = {};

    // open() → URL ve method'u kaydet
    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = method;
      _url = url;
      return originalOpen(method, url, ...rest);
    };

    // setRequestHeader() → header'ları topla
    const originalSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (key, value) {
      _requestHeaders[key] = value;
      return originalSetHeader(key, value);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _id = emitter.onRequestStart({
        url: _url,
        method: _method,
        headers: { ..._requestHeaders },
        body,
        type: 'xhr',
      });

      // XHR send() is sync — enrich with cookies async after start
      const capturedId = _id;
      const capturedUrl = _url;
      const capturedHeaders = { ..._requestHeaders };
      if (!Object.keys(capturedHeaders).some(k => k.toLowerCase() === 'cookie')) {
        getNativeCookies(capturedUrl).then(cookieStr => {
          if (cookieStr && capturedId) {
            emitter.onRequestHeadersUpdate(capturedId, { ...capturedHeaders, cookie: cookieStr });
          }
        }).catch(() => {});
      }

      // readystatechange dinle
      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4) {
          const responseHeaders = parseResponseHeaders(xhr.getAllResponseHeaders());
          let responseBody = xhr.responseText || xhr.response;
          try {
            if (typeof responseBody === 'string') {
              responseBody = JSON.parse(responseBody);
            }
          } catch { /* string olarak bırak */ }

          if (xhr.status > 0) {
            emitter.onRequestDone(_id, {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: responseHeaders,
              body: responseBody,
              size: (xhr.responseText || '').length,
            });
          } else {
            emitter.onRequestError(_id, new Error('Ağ hatası veya istek iptal edildi'));
          }
        }
      });

      xhr.addEventListener('error', (e) => {
        emitter.onRequestError(_id, e);
      });

      xhr.addEventListener('abort', () => {
        emitter.onRequestError(_id, new Error('İstek iptal edildi (abort)'));
      });

      return originalSend(body);
    };

    return xhr;
  }

  // Prototype ve statik özellikleri kopyala
  PatchedXHR.prototype = OriginalXHR.prototype;
  Object.setPrototypeOf(PatchedXHR, OriginalXHR);

  // Statik sabitler
  PatchedXHR.UNSENT = 0;
  PatchedXHR.OPENED = 1;
  PatchedXHR.HEADERS_RECEIVED = 2;
  PatchedXHR.LOADING = 3;
  PatchedXHR.DONE = 4;

  global.XMLHttpRequest = PatchedXHR;
  global.XMLHttpRequest._original = OriginalXHR;
}

function parseResponseHeaders(headerStr) {
  const headers = {};
  if (!headerStr) return headers;
  headerStr.trim().split('\r\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.substring(0, idx).trim().toLowerCase();
      const value = line.substring(idx + 1).trim();
      headers[key] = value;
    }
  });
  return headers;
}
