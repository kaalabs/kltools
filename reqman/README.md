# Reqman

Reqman is a terminal UI (TUI) for managing TOML-backed databases using OpenTUI.
It reads a JSON schema and a TOML database file, builds a record UI dynamically,
and lets you filter, add, edit, and delete records.

## Requirements

- Bun 1.3+ (OpenTUI core relies on `bun:ffi`)
- OpenTUI core `0.1.74` (latest published at the time of writing)

## Usage

```bash
npm install

# First run (creates the DB if missing and embeds the schema)
npm start -- --schema ./examples/schema.json --db ./examples/data.toml

# Next runs (schema loaded from DB metadata)
npm start -- ./examples/data.toml
```

Reqman stores the schema inside the TOML database under `[__reqman].schema_json`,
so you can run it later with only the database file path.

### Schema format

```json
{
  "name": "tasks",
  "primaryKey": "id",
  "description": "Task list",
  "fields": [
    { "name": "id", "type": "number", "required": true },
    { "name": "title", "type": "text", "required": true },
    { "name": "done", "type": "boolean" },
    { "name": "priority", "type": "choice", "options": ["low", "medium", "high"] },
    { "name": "due_date", "type": "date" },
    { "name": "due_time", "type": "time" }
  ]
}
```

Supported field types:

- `number`
- `text`
- `boolean`
- `choice` (requires `options`)
- `date` (YYYY-MM-DD)
- `time` (HH:MM or HH:MM:SS)

## TUI shortcuts

List mode:

- `n` new record
- `e` edit selected
- `d` delete selected
- `f` focus filter
- `tab` cycle focus
- `ctrl+q` quit

Form mode:

- `ctrl+s` save
- `esc` cancel
- `tab` next field
- `shift+tab` previous field
- `ctrl+q` quit
