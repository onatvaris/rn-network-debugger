/**
 * Örnek React Native Entegrasyonu
 *
 * Bu dosyayı projenizin index.js veya App.tsx dosyasının
 * EN ÜSTÜNE (tüm import'lardan önce) kopyalayın.
 */

import { Platform } from 'react-native';
import { startNetworkDebugger } from '@rn-network-debugger/core';

// ─── Network Debugger Başlatma ────────────────────────────────────────────────
if (__DEV__) {
  // Android emülatörde localhost = host makine için 10.0.2.2 kullanılır
  // iOS simülatörde ve fiziksel cihaz aynı ağdaysa localhost çalışır
  const debuggerHost =
    Platform.OS === 'android'
      ? '10.0.2.2'          // Android emülatör
      : 'localhost';         // iOS simülatör

  // Fiziksel cihaz kullanıyorsanız:
  // const debuggerHost = '192.168.1.x'; // Mac'inizin IP adresi

  startNetworkDebugger({
    serverUrl: `ws://${debuggerHost}:8788/app`,

    // Yakalanmaması gereken host'lar
    ignoredHosts: [
      'sentry.io',
      'analytics.example.com',
    ],

    // Axios interceptor'ı kapat (varsayılan: açık)
    // interceptAxios: false,

    // WebSocket interceptor'ı kapat (varsayılan: açık)
    // interceptWS: false,
  });
}

// ─── Geri kalan app kodu ──────────────────────────────────────────────────────
// import { AppRegistry } from 'react-native';
// import App from './App';
// AppRegistry.registerComponent('MyApp', () => App);
