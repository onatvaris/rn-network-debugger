# RN Network Debugger

A zero-dependency, browser-based network debugger for React Native.
Works with both **Bare React Native** and **Expo** projects. Supports Android and iOS.

> **No third-party tools required (Flipper, Proxyman, Charles, etc.)**
> The DevTools server starts automatically when Metro launches. Just open `http://localhost:8788` in your browser.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Bare React Native — Setup](#bare-react-native--setup)
- [Expo — Setup](#expo--setup)
- [Optional: Cookie Injection](#optional-cookie-injection)
- [Android Native HTTP (OkHttp)](#android-native-http-okhttp)
- [iOS Native HTTP (NSURLProtocol)](#ios-native-http-nsurlprotocol)
- [DevTools UI Usage](#devtools-ui-usage)
- [Claude Code MCP Integration](#claude-code-mcp-integration)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       React Native App                           │
│                                                                  │
│  fetch()  ──┐                                                    │
│  XHR      ──┤                                                    │
│  Axios    ──┼──► NetworkEventEmitter ──► WebSocket Client        │
│  WS       ──┘                                  │                 │
│                                         (auto-reconnect)         │
│  [Android] OkHttp ─────────────────────       │                 │
│  [iOS] NSURLProtocol ───────────────────       │                 │
└────────────────────────────────────────────────┼────────────────┘
                                                 │ ws://<host>:8788/app
                              ┌──────────────────▼──────────────────┐
                              │          DevTools Server             │
                              │      Node.js / localhost:8788        │
                              │    Starts automatically with Metro   │
                              └──────────────────┬───────────────────┘
                                                 │ ws://localhost:8788/ui
                              ┌──────────────────┴───────────────────┐
                              │                                       │
                    ┌─────────▼──────────┐             ┌─────────────▼──────────┐
                    │    DevTools UI      │             │   Claude Code MCP       │
                    │  http://localhost   │             │  (stdio transport)      │
                    │      :8788          │             │  rn-network-debugger-mcp│
                    └────────────────────┘             └────────────────────────┘
```

**Data flow:**
1. Every network request in the app is captured by the `core` package
2. Forwarded to the `server` over WebSocket (queued if disconnected)
3. `server` broadcasts the event to all connected browser panels
4. The browser UI updates in real time

---

## Features

| Feature | Status | Note |
|---------|--------|------|
| `fetch()` interception | ✅ | Automatic, no setup required |
| `XMLHttpRequest` interception | ✅ | Automatic, no setup required |
| `Axios` interception | ✅ | Auto-detected if Axios is installed |
| `WebSocket` interception | ✅ | Includes send/receive message history |
| Android Native HTTP (OkHttp) | ✅ | Additional setup required → [see](#android-native-http-okhttp) |
| iOS Native HTTP (NSURLProtocol) | ✅ | Additional setup required → [see](#ios-native-http-nsurlprotocol) |
| Cookie Store | ✅ | Captures Set-Cookie headers; view, edit, and delete by platform/domain |
| Cookie injection | ✅ | Auto-injects cookies into requests (requires `@react-native-cookies/cookies`) |
| Platform detection | ✅ | Android / iOS badge per request (via User-Agent / `x-app-device` header) |
| cURL export | ✅ | Copy any request as a ready-to-run cURL command |
| Color Thresholds | ✅ | Highlight slow or large requests with custom color rules |
| Request body | ✅ | JSON is automatically parsed and formatted |
| Response body | ✅ | JSON is automatically parsed and formatted |
| Header inspection | ✅ | Request and response headers shown separately |
| Timing info | ✅ | Duration, start/end time, response size |
| URL filtering | ✅ | Live search, case-insensitive |
| Type filtering | ✅ | fetch · xhr · axios · native · websocket |
| Status filtering | ✅ | Success · Error · Pending |
| History on reconnect | ✅ | Last 1000 requests loaded even if UI opens late |
| Multiple devices/simulators | ✅ | Requests from all devices appear in one panel |
| Zero cost in production | ✅ | No code runs when `__DEV__` is false |
| Auto-reconnect | ✅ | Retries after 2 seconds on disconnect |
| Claude Code MCP integration | ✅ | Query and analyze captured requests directly from Claude Code |

---

## Bare React Native — Setup

### Step 1 — Install

```bash
npm install @onatvaris/rn-network-debugger-core \
            @onatvaris/rn-network-debugger-metro-plugin \
            @onatvaris/rn-network-debugger-server
```

### Step 2 — metro.config.js

```js
const { getDefaultConfig } = require('@react-native/metro-config');
const { withNetworkDebugger } = require('@onatvaris/rn-network-debugger-metro-plugin');

const config = getDefaultConfig(__dirname);

module.exports = withNetworkDebugger(config, {
  port: 8788, // optional, default: 8788
});
```

> `withNetworkDebugger` automatically starts the DevTools server when Metro launches.
> No separate terminal needed.

### Step 3 — index.js

Add to the **very top** of the file, before all other imports:

```js
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';

if (__DEV__) {
  const host = Platform.OS === 'android'
    ? '10.0.2.2'   // Android emulator → host machine
    : 'localhost';  // iOS simulator

  startNetworkDebugger({
    serverUrl: `ws://${host}:8788/app`,
  });
}

// Then the rest of your imports...
import { AppRegistry } from 'react-native';
import App from './App';
AppRegistry.registerComponent('MyApp', () => App);
```

> ⚠️ `startNetworkDebugger` must be called before all other imports.
> Otherwise, requests made at app startup may not be captured.

### Step 4 — Android port forwarding

Run once at the start of each session:

```bash
adb reverse tcp:8788 tcp:8788
```

### Step 5 — Run

```bash
# Terminal 1 — Metro (DevTools server starts automatically)
npx react-native start

# Terminal 2
npx react-native run-ios     # for iOS
npx react-native run-android # for Android
```

When Metro starts, you should see this in the terminal:

```
╔════════════════════════════════════════════╗
║  RN Network Debugger Server                ║
║  DevTools UI  → http://localhost:8788      ║
║  WS (app)     → ws://localhost:8788/app    ║
║  WS (ui)      → ws://localhost:8788/ui     ║
╚════════════════════════════════════════════╝
```

Open `http://localhost:8788` in your browser. A green dot in the top-left means connected.

---

## Expo — Setup

In Expo Managed Workflow, native modules (OkHttp / NSURLProtocol) are unavailable,
but JS-layer interceptors (fetch, XHR, Axios, WebSocket) work fully.

### Step 1 — Install

```bash
npm install @onatvaris/rn-network-debugger-core \
            @onatvaris/rn-network-debugger-server
```

### Step 2 — app/_layout.tsx or App.tsx

```tsx
import { Platform } from 'react-native';
import { startNetworkDebugger } from '@onatvaris/rn-network-debugger-core';
import Constants from 'expo-constants';

if (__DEV__) {
  const host =
    Platform.OS === 'android'
      ? '10.0.2.2'
      : Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

  startNetworkDebugger({
    serverUrl: `ws://${host}:8788/app`,
  });
}
```

### Step 3 — Android port forwarding

```bash
adb reverse tcp:8788 tcp:8788
```

### Step 4 — Run

```bash
# Terminal 1 — Server (keep running)
node node_modules/@onatvaris/rn-network-debugger-server/src/index.js

# Terminal 2 — Expo
npx expo start
```

Open `http://localhost:8788` in your browser.

---

## Optional: Cookie Injection

If your app uses [`@react-native-cookies/cookies`](https://github.com/react-native-cookies/cookies),
the debugger will automatically read stored cookies and inject them into captured requests.
This is useful for replaying requests with the correct session state.

```bash
npm install @react-native-cookies/cookies
```

No additional configuration is needed — cookie injection activates automatically once the package is installed.

---

## Android Native HTTP (OkHttp)

> **Optional.** Only needed if you want to capture traffic from libraries that make
> HTTP requests at the native level, outside of `fetch`/XHR/Axios.

Copy the two files from `packages/core/android/` into your Android module:

```
android/app/src/main/java/com/yourapp/
├── RNNetworkDebuggerModule.java
└── DebugOkHttpClientFactory.java
```

Add to `MainApplication.java`:

```java
import com.yourapp.DebugOkHttpClientFactory;
import com.yourapp.RNNetworkDebuggerModule;
import com.facebook.react.modules.network.OkHttpClientProvider;
import android.os.Handler;
import android.os.Looper;

public class MainApplication extends Application implements ReactApplication {

  @Override
  public void onCreate() {
    super.onCreate();

    if (BuildConfig.DEBUG) {
      new Handler(Looper.getMainLooper()).post(() -> {
        try {
          ReactInstanceManager manager =
            getReactNativeHost().getReactInstanceManager();
          manager.addReactInstanceEventListener(context -> {
            RNNetworkDebuggerModule module =
              context.getNativeModule(RNNetworkDebuggerModule.class);
            OkHttpClientProvider.setOkHttpClientFactory(
              new DebugOkHttpClientFactory(module)
            );
          });
        } catch (Exception ignored) {}
      });
    }
  }
}
```

---

## iOS Native HTTP (NSURLProtocol)

> **Optional.** The iOS equivalent of the Android OkHttp setup.

Add the two files from `packages/core/ios/` to your Xcode project:

1. Right-click on the project in Xcode → **Add Files to "YourApp"**
2. Select `RNNetworkDebuggerURLProtocol.h` and `RNNetworkDebuggerURLProtocol.m`

Add to `AppDelegate.mm`:

```objc
#if DEBUG
#import "RNNetworkDebuggerURLProtocol.h"
#endif

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  RCTBridge *bridge = [[RCTBridge alloc] initWithDelegate:self
                                            launchOptions:launchOptions];
#if DEBUG
  [RNNetworkDebuggerBridge shared].bridge = bridge;
  [NSURLProtocol registerClass:[RNNetworkDebuggerURLProtocol class]];
#endif

  // ... rest of setup
  return YES;
}
```

---

## DevTools UI Usage

### Connection Status

A small dot appears in the top-left:
- 🟢 **Green** → Server is running and at least one app is connected
- 🔴 **Red** → Cannot connect to server (is Metro running?)

### Request List

Each row shows:

| Column | Description |
|--------|-------------|
| **Status** | HTTP status code (200, 404, 500…) or a spinner for pending requests |
| **Method** | GET · POST · PUT · DELETE · PATCH · WS |
| **Type** | `fetch` · `xhr` · `axios` · `native` · `websocket` |
| **URL** | Path + query portion of the URL (host abbreviated) |
| **Duration** | Time from request start to response end |
| **Size** | Response body size |

Click a row to open the detail panel.

### Detail Panel

| Tab | Content |
|-----|---------|
| **Response** | Response body — JSON is auto-formatted |
| **Request** | Sent body — for POST/PUT/PATCH requests |
| **Headers** | Request and response headers under separate headings |
| **Timing** | Start/end time, total duration, response size, platform |
| **Messages** | *(WebSocket only)* All send/receive messages with timestamps |

The **Copy as cURL** button in the detail panel generates a ready-to-run cURL command for the selected request, including headers and cookies.

### Cookie Store

Click **🍪 Cookies** in the toolbar to open the Cookie Store panel.

- Cookies are automatically captured from `Set-Cookie` response headers
- Grouped by platform (Android / iOS) and domain
- You can view, edit, or delete individual cookies
- Cookie values are injected into cURL exports automatically

### Color Thresholds

Click **⚡ Thresholds** in the toolbar to define color rules for Duration and Response Size.

- Set a min/max range (e.g. duration ≥ 1000ms → red)
- Matching rows are highlighted in the request list
- Rules are persisted in `localStorage`

### Filters

| Control | Function |
|---------|----------|
| URL search box | Live filtering, case-insensitive |
| Type selector | All Types / fetch / XHR / axios / Native HTTP / WebSocket |
| Status selector | All Statuses / Success (2xx-3xx) / Error (4xx-5xx+err) / Pending |
| 🗑 Clear | Resets the list and server history |

**Keyboard shortcuts:**
- `↑` / `↓` — navigate requests
- `Esc` — close detail panel / Cookie Store / Thresholds

---

## Claude Code MCP Integration

The `@onatvaris/rn-network-debugger-mcp` package exposes an MCP server that connects to the
running DevTools server and makes all captured network requests available to Claude Code.
This enables AI-assisted performance analysis, debugging, and request inspection directly from your editor.

### Install

```bash
npm install -g @onatvaris/rn-network-debugger-mcp
```

Or use it without installing via `npx` (recommended — see configuration below).

### Configure Claude Code

Add the MCP server to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "rn-network-debugger": {
      "command": "npx",
      "args": ["-y", "@onatvaris/rn-network-debugger-mcp"],
      "env": {
        "RN_DEBUGGER_URL": "ws://localhost:8788/ui"
      }
    }
  }
}
```

If you use a custom port, update `RN_DEBUGGER_URL` accordingly (e.g. `ws://localhost:8789/ui`).

Restart Claude Code after saving. The MCP server connects to the DevTools server automatically
and reconnects if the server restarts.

> **Note:** The DevTools server must be running (Metro started) for the MCP to have data.
> The MCP server itself starts on demand when Claude Code invokes a tool.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_requests` | List captured requests with optional filters: method, status code, URL substring, type, errors only |
| `get_request` | Full details of a single request — headers, body, response, timing |
| `analyze_performance` | Latency stats (avg, P50, P95, P99), slowest endpoints, error rates, breakdown by domain and status code |
| `get_recent_requests` | The N most recently captured requests, newest first |

### Example Prompts

Once connected, you can ask Claude things like:

- *"List all failed requests from the last session"*
- *"Analyze the performance of requests to /api/products"*
- *"Show me the response body of the slowest request"*
- *"How many 401 errors are there and which endpoints triggered them?"*
- *"Which domain has the highest average response time?"*

---

## API Reference

### `startNetworkDebugger(options?)`

```ts
startNetworkDebugger({
  /**
   * DevTools server WebSocket address.
   * Default: 'ws://localhost:8788'
   * Android emulator: 'ws://10.0.2.2:8788/app'
   * Physical device: 'ws://192.168.x.x:8788/app'
   */
  serverUrl?: string;

  /**
   * Enable/disable the Axios interceptor.
   * Default: true
   */
  interceptAxios?: boolean;

  /**
   * Enable/disable the WebSocket interceptor.
   * Default: true
   */
  interceptWS?: boolean;

  /**
   * Requests to these hosts will not be captured.
   * localhost:8788 and localhost:8081 are always excluded.
   */
  ignoredHosts?: string[];
})
// Returns: { stop: () => void }
```

**Example — selective configuration:**

```js
if (__DEV__) {
  const debuggerInstance = startNetworkDebugger({
    serverUrl: `ws://localhost:8788/app`,
    interceptWS: false,          // don't track WebSocket messages
    ignoredHosts: [
      'sentry.io',               // hide Sentry traffic
      'analytics.myapp.com',     // hide analytics traffic
    ],
  });

  // Stop if needed
  // debuggerInstance.stop();
}
```

---

## Troubleshooting

### ❌ Browser stuck on "Connecting…"

1. Is Metro running?
   ```bash
   npx react-native start
   ```

2. Did you see the server startup message in the terminal?
   ```
   ╔════════════════════════════════════════════╗
   ║  RN Network Debugger Server                ║
   ```

3. Port may be in use:
   ```bash
   lsof -i :8788   # macOS/Linux
   ```
   Solution: use a different port
   ```js
   // metro.config.js
   withNetworkDebugger(config, { port: 8789 })
   // index.js
   startNetworkDebugger({ serverUrl: 'ws://localhost:8789/app' })
   ```

---

### ❌ No requests appearing on Android emulator

```bash
adb reverse tcp:8788 tcp:8788
adb devices  # is the device connected?
```

Make sure `serverUrl` uses `10.0.2.2`:

```js
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
```

---

### ❌ Cannot connect on iOS physical device

Mac and device must be on the same Wi-Fi network. Use your Mac's IP address:

```bash
ipconfig getifaddr en0   # Mac IP
```

```js
startNetworkDebugger({ serverUrl: 'ws://192.168.1.42:8788/app' });
```

---

### ❌ Cannot connect in Expo Go

```js
import Constants from 'expo-constants';
const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
startNetworkDebugger({ serverUrl: `ws://${host}:8788/app` });
```

---

### ❌ Some requests are not showing

- Verify that `startNetworkDebugger` is called **before** all other imports
- Check whether the host is in your `ignoredHosts` list
- For libraries using native HTTP, complete the OkHttp/NSURLProtocol setup

---

### ❌ "Already initialized" warning

`startNetworkDebugger` should only be called once during the app's lifecycle.
If you see this warning, it is being called in multiple places. Keep a single call in `index.js`.

---

## FAQ

**Does this affect production build performance?**
No. The `if (!__DEV__) return` guard ensures no interceptor code enters the production bundle. Metro's tree-shaking completely removes branches where `__DEV__ === false`.

**Can multiple simulators/devices connect at the same time?**
Yes. The server supports multiple connections; requests from all devices appear in the same panel.

**I closed the UI — are my requests lost?**
No. The server keeps the last 1000 requests in memory. History is automatically loaded when the UI reopens.

**What happens if Axios is not installed?**
The `require('axios')` inside `interceptors/axios.js` is wrapped in a `try/catch`. If Axios is absent, it is silently skipped with no error.

**Are `react-native-nitro-fetch` or custom fetch implementations captured?**
Only libraries that use `global.fetch` and `global.XMLHttpRequest` are captured automatically. For libraries that use a fully native network layer, OkHttp (Android) and NSURLProtocol (iOS) setup is required.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, build instructions, and PR guidelines.
