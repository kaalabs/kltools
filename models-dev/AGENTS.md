# AGENTS.md (models-dev)

Instructions for Codex CLI when working in this directory tree (`kltools/models-dev/**`).

## Mandatory MCP usage

1. Use the OpenAI developer documentation MCP server for any OpenAI API / Responses API / ChatGPT Apps SDK / Codex details.
2. Use the Vercel MCP server for any interaction with Vercel projects/deployments.
3. Use the Exa MCP server for up-to-date, quality-focused internet context.
4. Use the Ref MCP server for up-to-date technical docs/snippets/best practices.
5. Only switch between (3) and (4) if the first choice is inconclusive.

## Project overview

`modelsdev` is a small Node.js (ESM) CLI built on oclif. It queries the public Models.dev API (`https://models.dev/api.json`) to list/show providers and models, and can add a model entry to `config.toml`.

## Repo layout

- `bin/` — CLI entrypoints (`bin/run.js` is the oclif bootstrap).
- `src/base-command.js` — shared oclif base with common flags + JSON helpers.
- `src/commands/**` — oclif commands (`providers/*`, `models/*`).
- `src/lib/api.js` — loads API data from URL, file path, or stdin (`-`).
- `src/lib/data.js` — filtering/sorting/pagination and model/provider utilities.
- `src/lib/format.js` — human output formatting (tables, truncation, etc).
- `config.toml` — local example config updated by `modelsdev models add`.

## Development commands

- Install deps: `npm install`
- Run tests: `npm test` (Node built-in test runner: `node --test`)
- Quick lint/syntax check: `npm run lint` (currently `node -c bin/run.js`)
- Local CLI: `npm link` then run `modelsdev ...`
  - Alternative (no link): `node bin/run.js help`

## Coding conventions (important)

- ESM only (`"type": "module"`). Use `import ... from` and include `.js` in relative imports.
- Use `node:`-prefixed built-ins (e.g. `node:fs/promises`, `node:path`), consistent with existing code.
- Keep output behavior consistent:
  - Every command supports `BaseCommand.baseFlags` (`--api-url`, `--format`, `--pretty/--compact`, `--timeout`).
  - Use `this.isJsonMode(flags)` and `this.outputJson(flags, payload)` for JSON output.
  - Human output uses `src/lib/format.js` (`renderTable`, `truncate`, etc.).
- Prefer adding pure helpers to `src/lib/*` rather than duplicating logic inside commands.
- Avoid touching generated/vendor code (`node_modules/**`).

## Adding/changing commands

- New commands live in `src/commands/<topic>/<name>.js` and should `extend BaseCommand`.
- Follow oclif patterns used here: `static summary`, `static flags`, `static args`, `async run()`.
- After changing command surface area (flags/args/commands), refresh the README command docs:
  - `npx oclif readme --readme-path README.md --output-dir docs`

## `config.toml` expectations

- `modelsdev models add` edits `config.toml` as plain text (no TOML parser); keep formatting simple and predictable.
- Provider sections are identified by headers like `[providers.<id>]` and model blocks by `[[providers.<id>.models]]`.

