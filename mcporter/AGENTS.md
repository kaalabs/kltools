# AGENTS.md

This file contains package-specific guidance for coding agents working in `kltools/mcporter/**`.

## Project Overview

`mcporter` is a Node.js CLI for discovering MCP servers from OpenCode and Codex configuration files, listing their tools, and invoking tools with JSON arguments.

## Requirements

- Node.js
- npm
- Bun only when building the standalone binary with `npm run build:bin`

## Common Commands

- Install deps: `npm install`
- Typecheck: `npm run typecheck`
- Build JS: `npm run build`
- Build release dist: `npm run dist:build`
- Test: `npm test`
- Local CLI after build: `node ./dist/index.js --help`
- Local package bin after build: `node ./bin/mcporter.js --help`
- Standalone binary: `npm run build:bin`

## Repo Layout

- `src/index.ts`: Commander CLI entrypoint and command handlers.
- `src/config.ts`: OpenCode and Codex MCP config discovery.
- `src/client.ts`: MCP SDK client setup for stdio and SSE transports.
- `bin/mcporter.js`: npm bin wrapper that executes the built local CLI.
- `scripts/build-dist.mjs`: release dist builder for the Bun-compiled standalone binary.
- `install.sh` / `install.ps1`: turnkey installers that download GitHub Release assets from `kaalabs/kltools`.
- `tests/cli.test.js`: Node test runner smoke tests for package metadata and local CLI identity.

## Conventions

- Keep this package self-contained inside `kltools/mcporter`.
- Do not commit `node_modules/`, `dist/`, or compiled binaries.
- When testing this package, use explicit local paths such as `node ./dist/index.js` or `node ./bin/mcporter.js`; do not rely on a `mcporter` binary from `PATH`.
- Keep README usage examples aligned with the public command name `mcporter`.
- Release tags for this package use `mcporter-vX.Y.Z`, not plain `vX.Y.Z`.
