# harnas-monitor

Read-only TUI dashboard that watches a `TASKS.toml` file and shows real-time progress + task details.

## Run

```bash
cargo run
```

Default file: `./TASKS.toml`

Or pass a path:

```bash
cargo run -- /path/to/TASKS.toml
```

## Keys

- `q` quit
- `r` reload now
- `↑/↓` select task
- `PgUp/PgDn` scroll details
- `?` help

