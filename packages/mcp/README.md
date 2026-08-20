# @onatvaris/rn-network-debugger-mcp

MCP (Model Context Protocol) server for [RN Network Debugger](https://github.com/onatvaris/rn-network-debugger). Exposes captured network requests, Redux actions, and console logs from a running DevTools server as tools Claude Code can call directly — for AI-assisted debugging and performance analysis.

## Install

```bash
npm install -g @onatvaris/rn-network-debugger-mcp
```

Or use it without installing, via `npx` (recommended — see configuration below).

## Configure Claude Code

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

Restart Claude Code after saving. The MCP server connects to the DevTools server automatically and reconnects if the server restarts.

> **Note:** The DevTools server must be running (Metro started) for the MCP to have data. The MCP server itself starts on demand when Claude Code invokes a tool.

## Available Tools

| Tool | Description |
|------|-------------|
| `server_status` | Connection state, number of captured requests, and connected app count |
| `list_requests` | List captured requests with optional filters: method, status code, URL substring, type, duration range, errors only |
| `get_request` | Full details of a single request — headers, body, response, timing |
| `get_recent_requests` | The N most recently captured requests, newest first |
| `analyze_performance` | Latency stats (avg, P50, P95, P99), slowest endpoints, error rates, breakdown by domain and status code |
| `find_duplicates` | Find duplicate/repeated requests — same URL called multiple times, useful for detecting redundant API calls |
| `search_response_bodies` | Search across all captured response bodies for a keyword or field name |
| `export_har` | Export captured requests as a HAR file compatible with Chrome DevTools, Postman, and Charles |
| `list_redux_actions` | List captured Redux actions; also shows top-level state slice names for use with `get_redux_action` |
| `get_redux_action` | Get details of a Redux action. Defaults to diff mode (only changed state keys). Supports `state_paths`, `include_prev_state`, `include_next_state`, and `max_chars` |
| `search_redux_actions` | Search Redux action types, payloads, and state for a keyword |
| `list_console_logs` | List captured console logs (`log`, `info`, `warn`, `error`) with optional level filter, text search, and time range |
| `search_console_logs` | Search across all captured console logs for a keyword, with optional level and case-sensitivity filters |

## Full Documentation

See the [main README](https://github.com/onatvaris/rn-network-debugger) for architecture, DevTools UI usage, setup, troubleshooting, and FAQ.

## License

Apache-2.0
