# RN Network Debugger

React Native için fetch/XHR/Axios/WebSocket/OkHttp/NSURLProtocol interceptor'larını
WebSocket üzerinden tarayıcı tabanlı bir DevTools UI'ına ileten network debugger.

## Paket Yapısı
- packages/core        → RN interceptor'ları (JS + Android Java + iOS ObjC)
- packages/server      → WebSocket + HTTP server (ws, express). UI: server/public/
- packages/metro-plugin → Metro config wrapper, server'ı spawn eder
- packages/ui          → React + Vite DevTools paneli. Build: npm run build → dist/

## Kritik Kurallar
- server/public/ klasörü ui/dist/ içeriğinin kopyasıdır. UI değişince tekrar kopyalanmalı.
- metro-plugin, server'ı packages/server/src/index.js üzerinden spawn eder.
- core/src/index.js __DEV__ false ise hiçbir şey yapmaz (production güvenli).
- Android emülatörde host: 10.0.2.2 | iOS simülatörde: localhost
- WS bağlantı URL'leri: /app (RN tarafı) ve /ui (tarayıcı tarafı)
- file: link kurulumlarında server/public/ node_modules'a kopyalanmayabilir.
  Çözüm: cache temizleyerek yeniden kur → yarn install && yarn start --reset-cache

## Paket Bağımlılıkları
- packages/server:       ws, express, cors
- packages/metro-plugin: ws
- packages/ui:           react, react-dom, vite, @vitejs/plugin-react

## Sık Yapılan İşlemler

### UI build + server'a kopyala
cd packages/ui && npm run build && cp -r dist/* ../server/public/

### Tüm bağımlılıkları kur
cd packages/server && npm install
cd ../metro-plugin && npm install
cd ../ui && npm install

### Server'ı test et
node packages/server/src/index.js

### Release zip oluştur
cd packages/ui && npm run build && cp -r dist/* ../server/public/
cd ../.. && zip -r rn-network-debugger.zip packages/ README.md example/ --exclude "*/node_modules/*"

## Proje Entegrasyon Özeti (Bare RN)

### package.json
"@rn-network-debugger/core": "file:../rn-network-debugger/packages/core",
"@rn-network-debugger/metro-plugin": "file:../rn-network-debugger/packages/metro-plugin",
"@rn-network-debugger/server": "file:../rn-network-debugger/packages/server"

### metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNetworkDebugger } = require('@rn-network-debugger/metro-plugin');
const config = mergeConfig(getDefaultConfig(__dirname), {});
module.exports = withNetworkDebugger(config, { port: 8788 });

### index.js (en üste)
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@rn-network-debugger/core';
if (__DEV__) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}

## Mimari

RN App (JS)                     DevTools Server           DevTools UI
fetch/XHR/Axios/WS  →WS→  localhost:8788  →WS→  http://localhost:8788

Android: OkHttp interceptor (MainApplication.java)
iOS:     NSURLProtocol (AppDelegate.mm)
