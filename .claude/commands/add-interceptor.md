# Adding a New Interceptor

1. Create packages/core/src/interceptors/<name>.js
2. Use the NetworkEventEmitter API:
   - emitter.onRequestStart({ url, method, headers, body, type })  → returns id
   - emitter.onRequestDone(id, { status, statusText, headers, body, size })
   - emitter.onRequestError(id, error)
   - emitter.onWSMessage(id, { direction, data })  → WebSocket only
3. Import it in packages/core/src/index.js
4. Call it inside the startNetworkDebugger() function
5. ignoredHosts filtering is handled automatically via emitter._isIgnored()
