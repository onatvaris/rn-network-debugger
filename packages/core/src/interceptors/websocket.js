/**
 * WebSocket interceptor
 *
 * global.WebSocket'i proxy ile sarer.
 * Bağlantı, mesaj gönderme/alma ve kapatma olaylarını yakalar.
 */

export function interceptWebSocket(emitter) {
  if (typeof global.WebSocket === 'undefined') return;

  const OriginalWebSocket = global.WebSocket;

  class PatchedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      super(url, protocols);

      this._debugId = emitter.onRequestStart({
        url,
        method: 'WS',
        headers: {},
        body: null,
        type: 'websocket',
      });

      const id = this._debugId;

      // Bağlantı kuruldu
      this.addEventListener('open', () => {
        emitter.onRequestDone(id, {
          status: 101,
          statusText: 'Switching Protocols',
          headers: {},
          body: null,
          size: 0,
        });
      });

      // Mesaj alındı (server → client)
      this.addEventListener('message', (event) => {
        emitter.onWSMessage(id, {
          direction: 'receive',
          data: event.data,
        });
      });

      // Hata
      this.addEventListener('error', (error) => {
        emitter.onRequestError(id, error);
      });

      // Kapatıldı
      this.addEventListener('close', (event) => {
        emitter.onWSMessage(id, {
          direction: 'close',
          data: `Kapatıldı (kod: ${event.code}, sebep: ${event.reason || 'yok'})`,
        });
      });
    }

    // send() override → client → server mesajlarını yakala
    send(data) {
      emitter.onWSMessage(this._debugId, {
        direction: 'send',
        data,
      });
      super.send(data);
    }
  }

  global.WebSocket = PatchedWebSocket;
  global.WebSocket._original = OriginalWebSocket;
}
