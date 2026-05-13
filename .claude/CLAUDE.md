# RN Network Debugger

A network debugger for React Native that forwards fetch/XHR/Axios/WebSocket/OkHttp/NSURLProtocol
interceptors to a browser-based DevTools UI over WebSocket.

## Package Structure
- packages/core        → RN interceptors (JS + Android Java + iOS ObjC)
  - src/index.js         → startNetworkDebugger() entry point
  - src/emitter.js       → central event bus (onRequestStart/Done/Error/HeadersUpdate/WSMessage)
  - src/transport.js     → WebSocket connection + queue
  - src/cookies.js       → optional @react-native-cookies/cookies integration
  - src/interceptors/    → fetch, xhr, axios, websocket interceptors
- packages/server      → WebSocket + HTTP server (ws, express). UI: server/public/
- packages/metro-plugin → Metro config wrapper, spawns the server
- packages/ui          → React + Vite DevTools panel. Build: npm run build → dist/

## Critical Rules
- server/public/ is a copy of ui/dist/ contents. Must be re-copied after any UI changes.
- metro-plugin spawns the server via packages/server/src/index.js.
- core/src/index.js does nothing when __DEV__ is false (production safe).
- Android emulator host: 10.0.2.2 | iOS simulator: localhost
- WS connection URLs: /app (RN side) and /ui (browser side)
- With file: link setups, server/public/ may not be copied into node_modules.
  Fix: reinstall with cache cleared → yarn install && yarn start --reset-cache
- cookies.js uses optional require('@react-native-cookies/cookies') — silently skipped if absent.
- emitter.js has onRequestHeadersUpdate() for async cookie injection in XHR interceptor.
- UI features: Cookie Store, Color Thresholds, Platform detection (Android/iOS), cURL export.
- __UI_VERSION__ in App.jsx is injected by vite.config.js from ui/package.json version field.

## Package Dependencies
- packages/server:       ws, express, cors
- packages/metro-plugin: ws
- packages/ui:           react, react-dom, vite, @vitejs/plugin-react

## Common Operations

### Build UI + copy to server
cd packages/ui && npm run build && cp -r dist/* ../server/public/

### Install all dependencies
cd packages/server && npm install
cd ../metro-plugin && npm install
cd ../ui && npm install

### Test the server
node packages/server/src/index.js

### Create a release zip
cd packages/ui && npm run build && cp -r dist/* ../server/public/
cd ../.. && zip -r rn-network-debugger.zip packages/ README.md example/ --exclude "*/node_modules/*"

## npm Package Names
- @onatvaris/rn-network-debugger-core
- @onatvaris/rn-network-debugger-server
- @onatvaris/rn-network-debugger-metro-plugin
- ui package is internal only (not published)
- @react-native-cookies/cookies is an optional peer dep of core (cookie injection feature)

## Project Integration Summary (Bare RN)

### Install
npm install @onatvaris/rn-network-debugger-core @onatvaris/rn-network-debugger-metro-plugin

### metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNetworkDebugger } = require('@onatvaris/rn-network-debugger-metro-plugin');
const config = mergeConfig(getDefaultConfig(__dirname), {});
module.exports = withNetworkDebugger(config, { port: 8788 });

### index.js (at the very top)
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';
if (__DEV__) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}

## Architecture

RN App (JS)                     DevTools Server           DevTools UI
fetch/XHR/Axios/WS  →WS→  localhost:8788  →WS→  http://localhost:8788

Android: OkHttp interceptor (MainApplication.java)
iOS:     NSURLProtocol (AppDelegate.mm)
