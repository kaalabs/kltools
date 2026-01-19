# AGENTS.md (harnas-monitor)

Instructions for coding agents (Codex CLI, etc.) working in this directory tree (`kltools/harnas-monitor/**`).

## Mandatory MCP usage

1. Use the OpenAI developer documentation MCP server for any OpenAI API / Responses API / ChatGPT Apps SDK / Codex details.
2. Use the Vercel MCP server for any interaction with Vercel projects/deployments.
3. Use the Exa MCP server for up-to-date, quality-focused internet context.
4. Use the Ref MCP server for up-to-date technical docs/snippets/best practices.
5. Only switch between (3) and (4) if the first choice is inconclusive.

## Project overview

`harnas-monitor` is a small Rust TUI that watches a `TASKS.toml` file and shows:
- overall progress (done/total),
- per-task status/priority/component,
- details for the selected task,
with live reload on file changes (and periodic refresh as a fallback).

This tool is intentionally **read-only**: it must never edit the tasks file.

## Requirements

- Rust stable (edition 2021)
- Terminal support for raw mode + alternate screen (via `crossterm`)

## Common commands

- Run: `cargo run`
  - Default tasks file path is `DEFAULT_TASKS_PATH` in `src/main.rs`.
- Run with explicit file: `cargo run -- /path/to/TASKS.toml`
- Format: `cargo fmt`
- Lint: `cargo clippy --all-targets --all-features -D warnings`
- Build: `cargo build`
- Test: `cargo test`

Notes:
- `target/` is Cargo build output; it should not be committed to git.

## Repo layout

- `src/main.rs` — app entrypoint, event loop, key handling, file watcher + reload debounce.
- `src/tasks.rs` — `TASKS.toml` parsing (`serde` + `toml`), normalization, and basic stats computation.
- `src/ui.rs` — all rendering (Ratatui widgets, layout, help modal, truncation, table offset logic).
- `TASKS.test.toml` — sample tasks file used for manual testing.

## Conventions & guardrails (important)

- Preserve **read-only** behavior: do not add any code that writes to `TASKS.toml`.
- Always restore the terminal on exit/error (raw mode off, leave alternate screen, show cursor).
  - Avoid early returns that skip `restore_terminal()`; prefer structured error handling.
- Keep UI behavior consistent:
  - Keybindings are documented in both `README.md` and the help modal in `src/ui.rs`.
  - If you change keys or behaviors, update both places.
- Treat task status as user input:
  - Use `normalize_status()` (`src/tasks.rs`) for comparisons and display normalization.
  - Avoid introducing fragile, case-sensitive checks.
- Keep changes minimal and local:
  - Parsing/stats logic lives in `src/tasks.rs`.
  - Rendering/layout lives in `src/ui.rs`.
  - IO/watch/event-loop concerns live in `src/main.rs`.
- Prefer idiomatic Rust error handling:
  - Use `anyhow::Result` and `.context(...)` / `.with_context(...)` on fallible IO.
  - Avoid `unwrap()`/`expect()` in runtime code unless the failure is truly impossible.

## Manual smoke test checklist

- `cargo run -- TASKS.test.toml`
- Edit `TASKS.test.toml` while the TUI is open; confirm it reloads and the bell chimes on content change.
- Confirm `q` always exits cleanly (terminal is restored, cursor visible).
