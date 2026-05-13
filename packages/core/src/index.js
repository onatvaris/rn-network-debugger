/**
 * @onatvaris/rn-network-debugger-core
 *
 * Main entry point. Initializes all interceptors and connects to the
 * DevTools server over WebSocket.
 *
 * Usage (at the very top of index.js or App.tsx):
 *   import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';
 *   if (__DEV__) startNetworkDebugger({ serverUrl: 'ws://localhost:8788/app' });
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
 * @param {string} [options.serverUrl]       - DevTools server WS address (default: ws://localhost:8788)
 * @param {boolean} [options.interceptAxios] - Enable Axios interceptor (default: true)
 * @param {boolean} [options.interceptWS]    - Enable WebSocket interceptor (default: true)
 * @param {string[]} [options.ignoredHosts]  - Hosts to exclude from capture
 */
export function startNetworkDebugger(options = {}) {
  if (!__DEV__) return;
  if (_started) {
    console.warn('[RNNetworkDebugger] Already initialized, skipping duplicate call.');
    return;
  }
  _started = true;

  const serverUrl = options.serverUrl || 'ws://localhost:8788';
  let serverHost = 'localhost:8788';
  try { serverHost = new URL(serverUrl).host; } catch {}

  const config = {
    serverUrl,
    interceptAxiosEnabled: options.interceptAxios !== false,
    interceptWSEnabled: options.interceptWS !== false,
    ignoredHosts: [
      serverHost,
      'localhost:8788',
      '10.0.2.2:8788',
      'localhost:8081',
      '10.0.2.2:8081',
      ...(options.ignoredHosts || []),
    ],
  };

  const emitter = new NetworkEventEmitter(config.ignoredHosts);
  const transport = createWSTransport(config.serverUrl, emitter);

  interceptFetch(emitter);
  interceptXHR(emitter);

  if (config.interceptAxiosEnabled) {
    interceptAxios(emitter);
  }

  if (config.interceptWSEnabled) {
    interceptWebSocket(emitter);
  }

  transport.connect();

  console.log(`[RNNetworkDebugger] Started → ${config.serverUrl}`);

  return {
    stop: () => {
      transport.disconnect();
      _started = false;
    },
  };
}

export { NetworkEventEmitter };
