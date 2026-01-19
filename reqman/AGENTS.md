# AGENTS.md

This file contains repo-specific guidance for coding agents (Codex CLI, etc.) working on Reqman.

## Project overview

Reqman is a terminal UI (TUI) for managing TOML-backed “databases” using OpenTUI. It reads a JSON schema plus a TOML file, builds a record UI dynamically, and supports filtering, add/edit/delete.

## Requirements

- Bun `1.3+` (OpenTUI core relies on `bun:ffi`)
- Node.js (for `npm install`, lockfile is `package-lock.json`)

## Common commands

- Install deps: `npm install`
- Run (dev): `npm start -- --schema ./examples/schema.json --db ./examples/data.toml`
- Typecheck: `npm run typecheck`
- Build JS (tsc output): `npm run build`
- Build native binary (platform-specific): `bun build src/index.ts --compile --outfile dist/reqman`
- Run binary: `./dist/reqman --schema ./examples/schema.json --db ./examples/data.toml`

Notes:

- `dist/` is gitignored; don’t hand-edit build outputs.
- The compiled binary is platform-specific (build it on the target OS/arch).

## Repo layout

- `src/index.ts`: single entrypoint (CLI parsing, schema validation, UI, persistence)
- `examples/schema.json`: sample schema (keep in sync with supported field types)
- `examples/data.toml`: sample data
- `dist/`: build outputs (ignored)

## Conventions & guardrails

- TypeScript is `strict`; avoid `any` and keep types accurate.
- Project is ESM (`"type": "module"`); prefer `import … from` with `node:` builtins.
- Keep changes small and localized (this repo is intentionally single-file right now).
- When changing schema behavior or field types, update `README.md` and `examples/schema.json`.

## TUI/layout guidance

OpenTUI uses Yoga-based layout and text measurement can affect flex sizing.

- For side-by-side panels (`flexDirection: "row"`), set `flexBasis: 0` and `minWidth: 0` on sibling panels to keep widths stable and prevent long text from “pushing” other panels.
- Prefer truncation/wrapping for long content rather than allowing intrinsic text width to drive layout.

## Validation / smoke test

- Run `npm run typecheck` after changes.
- Manual smoke: start with the example schema/db, create/edit records, and type long values to ensure layout stays stable.
