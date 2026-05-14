# @onatvaris/rn-network-debugger-server

WebSocket + HTTP DevTools server for [RN Network Debugger](https://github.com/onatvaris/rn-network-debugger). Receives network events from the React Native app and serves the browser-based DevTools UI.

This package is typically started automatically via [`@onatvaris/rn-network-debugger-metro-plugin`](https://www.npmjs.com/package/@onatvaris/rn-network-debugger-metro-plugin). Manual usage is only needed for Expo projects.

## Bare React Native

Install the metro plugin — it starts this server automatically when Metro launches:

```bash
npm install @onatvaris/rn-network-debugger-core @onatvaris/rn-network-debugger-metro-plugin
```

See [`@onatvaris/rn-network-debugger-metro-plugin`](https://www.npmjs.com/package/@onatvaris/rn-network-debugger-metro-plugin) for setup.

## Expo — Manual Start

```bash
npm install @onatvaris/rn-network-debugger-core @onatvaris/rn-network-debugger-server
```

Start the server manually in a separate terminal:

```bash
node node_modules/@onatvaris/rn-network-debugger-server/src/index.js
```

Then in `app/_layout.tsx` or `App.tsx`:

```tsx
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';
import Constants from 'expo-constants';

if (__DEV__) {
  const host =
    Platform.OS === 'android'
      ? '10.0.2.2'
      : Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:8788` | DevTools UI (open in browser) |
| `ws://localhost:8788/app` | React Native app connects here |
| `ws://localhost:8788/ui` | Browser DevTools panel connects here |

## Full Documentation

See the [main README](https://github.com/onatvaris/rn-network-debugger) for architecture, DevTools UI usage, troubleshooting, and FAQ.

## License

Apache-2.0
