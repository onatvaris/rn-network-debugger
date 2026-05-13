/**
 * WebSocket Transport
 *
 * Core'dan gelen olayları DevTools server'ına iletir.
 * Bağlantı koptuğunda otomatik yeniden bağlanır.
 */

const RECONNECT_DELAY = 2000;
const MAX_QUEUE = 500;

export function createWSTransport(serverUrl, emitter) {
  let ws = null;
  let connected = false;
  let reconnectTimer = null;
  let destroyed = false;
  const queue = []; // Bağlantı kurulmadan gelen mesajları tampon

  function connect() {
    if (destroyed) return;

    try {
      // DevTools server'ına bağlanmak için orijinal WebSocket'i kullan
      const OriginalWS = global.WebSocket?._original || global.WebSocket;
      ws = new OriginalWS(serverUrl);

      ws.onopen = () => {
        connected = true;
        console.log('[RNNetworkDebugger] DevTools server\'a bağlandı');

        // Kuyruktaki mesajları gönder
        while (queue.length > 0) {
          const msg = queue.shift();
          sendMessage(msg);
        }
      };

      ws.onclose = () => {
        connected = false;
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        connected = false;
        // onclose da çağrılacak, reconnect oradan
      };
    } catch (e) {
      if (!destroyed) {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }

  function sendMessage(message) {
    if (connected && ws?.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (e) {
        // Görmezden gel
      }
    } else {
      // Kuyruğa ekle
      if (queue.length < MAX_QUEUE) {
        queue.push(message);
      }
    }
  }

  // Emitter'a abone ol
  const unsubscribe = emitter.subscribe((message) => {
    sendMessage(message);
  });

  function disconnect() {
    destroyed = true;
    clearTimeout(reconnectTimer);
    unsubscribe();
    ws?.close();
    ws = null;
  }

  return { connect, disconnect };
}
