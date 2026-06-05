# Contributing to RN Network Debugger

Thank you for your interest in contributing!

---

## Project Structure

```
rn-network-debugger/
├── packages/
│   ├── core/                        # RN interceptors — published to npm
│   │   └── src/
│   │       ├── index.js             # startNetworkDebugger() entry point
│   │       ├── emitter.js           # Central event bus
│   │       ├── transport.js         # WebSocket connection + queue
│   │       ├── cookies.js           # Optional @react-native-cookies/cookies integration
│   │       └── interceptors/
│   │           ├── fetch.js         # global.fetch monkey-patch
│   │           ├── xhr.js           # XMLHttpRequest wrap
│   │           ├── axios.js         # Axios interceptor API
│   │           └── websocket.js     # global.WebSocket proxy
│   │
│   ├── server/                      # DevTools WebSocket + HTTP server — published to npm
│   │   ├── src/index.js             # Express + ws, port 8788
│   │   └── public/                  # Built UI (vite writes here directly — do not edit directly)
│   │
│   ├── metro-plugin/                # Metro config wrapper — published to npm
│   │   └── src/index.js             # withNetworkDebugger(), starts server automatically
│   │
│   └── ui/                          # Browser DevTools panel (React + Vite) — not published
│       ├── src/App.jsx              # Main UI component
│       └── vite.config.js           # Builds to ../server/public/
│
├── example/
│   └── setup.js                     # Copy-paste integration example
├── README.md
└── CONTRIBUTING.md
```

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/onatvaris/rn-network-debugger.git
cd rn-network-debugger
```

### 2. Install dependencies

Each package manages its own dependencies:

```bash
cd packages/server && npm install
cd ../metro-plugin && npm install
cd ../ui && npm install
```

### 3. Build the UI

The UI must be built and copied to `packages/server/public/` before running the server:

```bash
cd packages/ui && npm run build
```

Vite is configured to output directly into `../server/public/`, so no manual copy is needed.

### 4. Start the server

```bash
node packages/server/src/index.js
```

Open `http://localhost:8788` in your browser.

### 5. Develop the UI with hot reload

The Vite dev server proxies WebSocket traffic to the running server:

```bash
# Terminal 1 — server
node packages/server/src/index.js

# Terminal 2 — UI dev server
cd packages/ui && npm run dev
```

Open `http://localhost:5173` for hot-reload. Point your RN app at `ws://localhost:8788/app` as usual.

---

## Common Tasks

### Rebuild UI after changes

```bash
cd packages/ui && npm run build
```

Vite writes output to `packages/server/public/` automatically.

### Test the server standalone

```bash
node packages/server/src/index.js
```

### Create a release zip

```bash
cd packages/ui && npm run build
cd ../.. && zip -r rn-network-debugger.zip packages/ README.md example/ --exclude "*/node_modules/*"
```

---

## Adding a New Interceptor

Use the `/add-interceptor` slash command in Claude Code for a guided walkthrough, or follow these steps manually:

1. Create `packages/core/src/interceptors/<name>.js`
2. Export an `intercept<Name>(emitter)` function
3. Call `emitter.onRequestStart()`, `onRequestDone()`, and `onRequestError()`
4. Import and call it in `packages/core/src/index.js`
5. Add the new type to the filter dropdown in `packages/ui/src/App.jsx`

---

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Run `node packages/server/src/index.js` and manually verify the UI before submitting
- If you change the UI, include a rebuilt `packages/server/public/` in your PR
- Update `README.md` if your change adds or removes user-facing behavior
- The `master` branch is the stable release branch

---

## Releasing

See the `/release` slash command in Claude Code for the automated release flow.

Manual steps:
1. Bump versions in `packages/core/package.json`, `packages/server/package.json`, `packages/metro-plugin/package.json`
2. Build and copy the UI: `cd packages/ui && npm run build`
3. Publish each package: `npm publish --access public` (from each package directory)
