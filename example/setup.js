/**
 * Example React Native Integration
 *
 * Copy this to the VERY TOP of your project's index.js or App.tsx
 * (before all other imports).
 */

import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';

if (__DEV__) {
  const debuggerHost =
    Platform.OS === 'android'
      ? '10.0.2.2'   // Android emulator → host machine
      : 'localhost';  // iOS simulator

  // Physical device: use your Mac's IP address instead
  // const debuggerHost = '192.168.1.x';

  startNetworkDebugger({
    serverUrl: `ws://${debuggerHost}:8788/app`,

    // Hosts to exclude from capture
    ignoredHosts: [
      'sentry.io',
      'analytics.example.com',
    ],

    // Disable Axios interceptor (default: enabled)
    // interceptAxios: false,

    // Disable WebSocket interceptor (default: enabled)
    // interceptWS: false,
  });
}

// ─── Rest of your app ─────────────────────────────────────────────────────────
// import { AppRegistry } from 'react-native';
// import App from './App';
// AppRegistry.registerComponent('MyApp', () => App);
