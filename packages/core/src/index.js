/**
 * @rn-network-debugger/core
 *
 * Ana entry point. Tüm interceptor'ları başlatır ve
 * DevTools server'ına WebSocket üzerinden bağlanır.
 *
 * Kullanım (index.js veya App.tsx'in en üstüne):
 *   import { startNetworkDebugger } from '@rn-network-debugger/core';
 *   if (__DEV__) startNetworkDebugger({ serverUrl: 'ws://localhost:8788' });
 */

import { NetworkEventEmitter } from './emitter';
import { interceptFetch } from './interceptors/fetch';
import { interceptXHR } from './interceptors/xhr';
import { interceptAxios } from './interceptors/axios';
import { interceptWebSocket } from './interceptors/websocket';
import { createWSTransport } from './transport';

let _started = false;

/**
 * @param {object} options
 * @param {string} [options.serverUrl]      - DevTools server WS adresi (varsayılan: ws://localhost:8788)
 * @param {boolean} [options.interceptAxios] - Axios interceptor aktif mi (varsayılan: true)
 * @param {boolean} [options.interceptWS]    - WebSocket interceptor aktif mi (varsayılan: true)
 * @param {string[]} [options.ignoredHosts]  - Yakalanmayacak host listesi
 */
export function startNetworkDebugger(options = {}) {
  if (!__DEV__) return; // Production'da hiçbir şey yapma
  if (_started) {
    console.warn('[RNNetworkDebugger] Zaten başlatıldı, tekrar çağrılmıyor.');
    return;
  }
  _started = true;

  const config = {
    serverUrl: options.serverUrl || 'ws://localhost:8788',
    interceptAxiosEnabled: options.interceptAxios !== false,
    interceptWSEnabled: options.interceptWS !== false,
    ignoredHosts: [
      'localhost:8788',     // Kendi DevTools server'ımızı yakalamasın
      'localhost:8081',     // Metro bundler
      ...(options.ignoredHosts || []),
    ],
  };

  const emitter = new NetworkEventEmitter(config.ignoredHosts);
  const transport = createWSTransport(config.serverUrl, emitter);

  // JS katmanı interceptor'ları
  interceptFetch(emitter);
  interceptXHR(emitter);

  if (config.interceptAxiosEnabled) {
    interceptAxios(emitter);
  }

  if (config.interceptWSEnabled) {
    interceptWebSocket(emitter);
  }

  transport.connect();

  console.log(`[RNNetworkDebugger] Başlatıldı → ${config.serverUrl}`);

  return {
    stop: () => {
      transport.disconnect();
      _started = false;
    },
  };
}

export { NetworkEventEmitter };
