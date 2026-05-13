# Yeni Interceptor Ekleme

1. packages/core/src/interceptors/<name>.js dosyasını oluştur
2. NetworkEventEmitter API'sini kullan:
   - emitter.onRequestStart({ url, method, headers, body, type })  → id döner
   - emitter.onRequestDone(id, { status, statusText, headers, body, size })
   - emitter.onRequestError(id, error)
   - emitter.onWSMessage(id, { direction, data })  → sadece WS için
3. packages/core/src/index.js içine import et
4. startNetworkDebugger() fonksiyonu içinde çağır
5. ignoredHosts kontrolü emitter._isIgnored() ile otomatik yapılır
