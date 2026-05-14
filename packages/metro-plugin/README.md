# @onatvaris/rn-network-debugger-metro-plugin

Metro config wrapper that automatically starts the [RN Network Debugger](https://github.com/onatvaris/rn-network-debugger) DevTools server when Metro launches. No separate terminal needed.

## Installation

```bash
npm install @onatvaris/rn-network-debugger-core @onatvaris/rn-network-debugger-metro-plugin
```

## Setup

### metro.config.js

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNetworkDebugger } = require('@onatvaris/rn-network-debugger-metro-plugin');

const config = mergeConfig(getDefaultConfig(__dirname), {});

module.exports = withNetworkDebugger(config, {
  port: 8788, // optional, default: 8788
});
```

### index.js

```js
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';

if (__DEV__) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}
```

### Android port forwarding

Run once per session:

```bash
adb reverse tcp:8788 tcp:8788
```

## Usage

Start Metro as usual:

```bash
npx react-native start
```

When Metro starts, you'll see:

```
╔════════════════════════════════════════════╗
║  RN Network Debugger Server                ║
║  DevTools UI  → http://localhost:8788      ║
║  WS (app)     → ws://localhost:8788/app    ║
║  WS (ui)      → ws://localhost:8788/ui     ║
╚════════════════════════════════════════════╝
```

Open `http://localhost:8788` in your browser.

## Expo

This plugin is not needed for Expo. Start the server manually instead:

```bash
node node_modules/@onatvaris/rn-network-debugger-server/src/index.js
```

## Full Documentation

See the [main README](https://github.com/onatvaris/rn-network-debugger) for architecture, DevTools UI usage, troubleshooting, and FAQ.

## License

Apache-2.0
