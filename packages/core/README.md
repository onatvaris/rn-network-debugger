# @onatvaris/rn-network-debugger-core

Network interceptors for React Native. Captures `fetch`, `XHR`, `Axios`, `WebSocket`, OkHttp (Android), and NSURLProtocol (iOS) traffic and forwards it to the [RN Network Debugger](https://github.com/onatvaris/rn-network-debugger) DevTools server.

## Installation

```bash
npm install @onatvaris/rn-network-debugger-core @onatvaris/rn-network-debugger-metro-plugin
```

## Setup

Add to the **very top** of `index.js`, before all other imports:

```js
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';

if (__DEV__) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}
```

> `startNetworkDebugger` must be called before all other imports so requests made at startup are captured.

## API

```ts
startNetworkDebugger({
  serverUrl?: string;       // default: 'ws://localhost:8788'
  interceptAxios?: boolean; // default: true
  interceptWS?: boolean;    // default: true
  ignoredHosts?: string[];  // hosts to exclude (localhost:8788 always excluded)
})
// Returns: { stop: () => void }
```

## Expo

```tsx
import Constants from 'expo-constants';

if (__DEV__) {
  const host =
    Platform.OS === 'android'
      ? '10.0.2.2'
      : Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

  startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
}
```

## Android Native HTTP (OkHttp) — Optional

Copy `android/src/main/java/com/rnnetworkdebugger/` files into your app and add to `MainApplication.java`:

```java
if (BuildConfig.DEBUG) {
  new Handler(Looper.getMainLooper()).post(() -> {
    ReactInstanceManager manager = getReactNativeHost().getReactInstanceManager();
    manager.addReactInstanceEventListener(context -> {
      RNNetworkDebuggerModule module = context.getNativeModule(RNNetworkDebuggerModule.class);
      OkHttpClientProvider.setOkHttpClientFactory(new DebugOkHttpClientFactory(module));
    });
  });
}
```

## iOS Native HTTP (NSURLProtocol) — Optional

Add `ios/RNNetworkDebuggerURLProtocol.h` and `.m` to your Xcode project, then in `AppDelegate.mm`:

```objc
#if DEBUG
#import "RNNetworkDebuggerURLProtocol.h"
[RNNetworkDebuggerBridge shared].bridge = bridge;
[NSURLProtocol registerClass:[RNNetworkDebuggerURLProtocol class]];
#endif
```

## Optional: Cookie Injection

Install [`@react-native-cookies/cookies`](https://github.com/react-native-cookies/cookies) — cookies are automatically read and injected into captured requests with no extra configuration.

## Zero Production Cost

The interceptors are completely disabled when `__DEV__` is `false`. No code runs in production builds.

## Full Documentation

See the [main README](https://github.com/onatvaris/rn-network-debugger) for architecture, DevTools UI usage, troubleshooting, and FAQ.

## License

Apache-2.0
