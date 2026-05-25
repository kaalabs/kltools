# mcporter

CLI for MCP (Model Context Protocol) servers discovered from OpenCode and Codex configurations.

## Installation

```bash
# From source
npm install
npm run build
npm link

# Or use the local package wrapper after building
node ./bin/mcporter.js --help
```

## Usage

```bash
mcporter [options] <command> [arguments]
```

### Global Options

- `-v, --verbose` — Enable verbose/debug logging (shows connection details, skipped servers, etc.)
- `--version` — Show version
- `--help` — Show help

### Commands

#### `list-servers`

List all discovered MCP servers from your OpenCode and Codex configs.

```bash
mcporter list-servers
mcporter --verbose list-servers
```

#### `list-tools <serverName>`

List available tools on a specific MCP server.

```bash
mcporter list-tools tavily-mcp
mcporter --verbose list-tools exa
```

#### `call-tool <serverName> <toolName>`

Call a tool on a specific server. Arguments are passed as JSON.

```bash
mcporter call-tool tavily-mcp tavily_search --args '{"query": "latest AI news 2026", "time_range": "month"}'

# With verbose output
mcporter --verbose call-tool tavily-mcp tavily_search --args '{"query": "AI agents"}'
```

### Examples

**Search for AI news using Tavily:**

```bash
mcporter call-tool tavily-mcp tavily_search \
  --args '{
    "query": "latest AI news 2026",
    "time_range": "month",
    "search_depth": "advanced",
    "max_results": 10
  }'
```

**List tools from the Exa server:**

```bash
mcporter list-tools exa
```

## Configuration Sources

The tool automatically discovers servers from:

- **OpenCode**: `~/.config/opencode/opencode.json`
- **Codex**: `~/.codex/config.toml`

Supports both `stdio` (local commands) and `sse` (remote URLs) transports.

## Development

```bash
npm run build          # Compile TypeScript
npm run build:bin      # Create standalone binary with Bun
node ./dist/index.js --help
```

## License

ISC
