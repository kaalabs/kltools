# kltools

Mono-repo for kaaLabs tooling.

Each tool is self-contained and ships with its own `README.md` covering install, usage, and development details. The repository currently includes terminal UIs, API-focused CLIs, and MCP servers.

## Index

- `harnas-monitor` — read-only TUI dashboard that watches a `TASKS.toml` file and shows real-time progress + task details. Docs: [harnas-monitor/README.md](harnas-monitor/README.md)
- `models-dev` — `modelsdev` CLI for querying the public models.dev API (providers + models). Docs: [models-dev/README.md](models-dev/README.md)
- `reqman` — `reqman` terminal UI (TUI) for managing TOML-backed databases from a JSON schema (OpenTUI). Docs: [reqman/README.md](reqman/README.md)
- `weather-mcp` — stateless weather MCP server backed by Open-Meteo, with fuzzy city search, current conditions, 12-hour hourly outlook, and 7-day forecasts over `stdio`, `http`, `sse`, or `streamable-http`. Docs: [weather-mcp/README.md](weather-mcp/README.md)

## Working In This Repo

- Pick a tool directory and follow its `README.md`.
- Most tools are independently installable and runnable from their own directory.
