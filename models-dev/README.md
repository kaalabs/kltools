# modelsdev-cli

CLI to query the public Models.dev API (`https://models.dev/api.json`) for providers and the models they offer.
Built on oclif for consistent command, flag, and help behavior.

## Install

```bash
npm install
npm link
```

## Binary distribution (Ubuntu 24.04)

Build the tarballs (writes to `dist/`):

```bash
npx oclif pack tarballs --targets linux-x64,linux-arm64
```

Other targets:

```bash
npx oclif pack tarballs --targets darwin-x64,darwin-arm64
npx oclif pack tarballs --targets win32-x64
```

Notes:

- Windows tarball packaging requires 7-zip to be installed and available on PATH.
- The packer downloads Node binaries during packaging.

Install from a built tarball (prompts you to select one):

```bash
bash scripts/install-ubuntu.sh
```

Optional overrides:

```bash
PREFIX=/opt bash scripts/install-ubuntu.sh
TARBALL=dist/modelsdev-<version>-linux-x64.tar.gz bash scripts/install-ubuntu.sh
```

## Usage

```bash
modelsdev help
modelsdev providers list --help
modelsdev models list --help
```

### List providers

```bash
modelsdev providers list
modelsdev providers list --q open
modelsdev providers list --format json --pretty
modelsdev providers list --json
```

### Show a provider and its models

```bash
modelsdev providers show openai
modelsdev providers show openai --format json
```

### List models (filtered / unfiltered)

```bash
# Unfiltered
modelsdev models list

# Filtered
modelsdev models list --provider openai --q gpt
modelsdev models list --provider vercel --q gemini --format json

# Capability filters
modelsdev models list --tool-call --structured-output --format json
modelsdev models list --input image --min-context 200000
```

### Show full details for a model

```bash
modelsdev models show openai/gpt-4.1-nano
modelsdev models show openai/gpt-4.1-nano --format json --pretty
modelsdev models show openai/gpt-4.1-nano --json
```

## Notes

- `--api-url` supports a URL, a local file path, or `-` for stdin.
- Some model IDs contain `/` (for example: `vercel/google/gemini-3-pro-preview`). Use the full `providerId/modelId` ref when in doubt.

## Commands

<!-- commands -->
* [`modelsdev help [COMMAND]`](#modelsdev-help-command)
* [`modelsdev models add REF`](#modelsdev-models-add-ref)
* [`modelsdev models list`](#modelsdev-models-list)
* [`modelsdev models show REF`](#modelsdev-models-show-ref)
* [`modelsdev providers list`](#modelsdev-providers-list)
* [`modelsdev providers show PROVIDERID`](#modelsdev-providers-show-providerid)

## `modelsdev help [COMMAND]`

Display help for modelsdev.

```
USAGE
  $ modelsdev help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for modelsdev.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.36/src/commands/help.ts)_

## `modelsdev models list`

List models from models.dev

```
USAGE
  $ modelsdev models list [--json] [--api-url <value>] [--format human|json] [--pretty | --compact] [--timeout
    <value>] [-p <value>...] [--q <value>] [--family <value>...] [--status <value>...] [--reasoning] [--tool-call]
    [--attachment] [--structured-output] [--temperature] [--open-weights] [--interleaved] [--input <value>...] [--output
    <value>...] [--min-context <value>] [--min-output <value>] [--sort ref|name|context|output] [--desc] [--limit
    <value>] [--offset <value>] [-d]

FLAGS
  -d, --details              Include full model details
  -p, --provider=<value>...  Provider id (repeatable, comma-separated)
      --api-url=<value>      [default: https://models.dev/api.json, env: MODELSDEV_API_URL] API URL, file path, or '-'
                             for stdin
      --attachment           Only models with attachments
      --compact              Compact JSON output (only for --format json)
      --desc                 Sort descending
      --family=<value>...    Model family (repeatable, comma-separated)
      --format=<option>      [default: human] Output format
                             <options: human|json>
      --input=<value>...     Require input modality (repeatable, comma-separated)
      --interleaved          Only models with interleaved inputs
      --limit=<value>        Limit results
      --min-context=<value>  Minimum context window
      --min-output=<value>   Minimum output limit
      --offset=<value>       Skip first N results
      --open-weights         Only models with open weights
      --output=<value>...    Require output modality (repeatable, comma-separated)
      --pretty               Pretty JSON output (only for --format json)
      --q=<value>            Search in model id, name, family, or ref
      --reasoning            Only models with reasoning
      --sort=<option>        [default: ref] Sort by ref, name, context, or output
                             <options: ref|name|context|output>
      --status=<value>...    Model status (repeatable, comma-separated)
      --structured-output    Only models with structured output
      --temperature          Only models with temperature
      --timeout=<value>      [default: 15000] Fetch timeout in ms
      --tool-call            Only models with tool calls

GLOBAL FLAGS
  --json  Format output as json.
```

## `modelsdev models add REF`

Add a model to config.toml

```
USAGE
  $ modelsdev models add REF [--json] [--api-url <value>] [--format human|json] [--pretty | --compact]
    [--timeout <value>] [--config <value>] [--type <value>] [--label <value>] [--description <value>]
    [--provider-name <value>] [--provider-base-url <value>] [--provider-api-key-env <value>]

ARGUMENTS
  REF  providerId/modelId or modelId

FLAGS
  --api-url=<value>               [default: https://models.dev/api.json, env: MODELSDEV_API_URL] API URL, file path, or
                                  '-' for stdin
  --compact                        Compact JSON output (only for --format json)
  --config=<value>                 [default: config.toml] Path to config.toml
  --description=<value>            Model description override
  --format=<option>                [default: human] Output format
                                  <options: human|json>
  --label=<value>                  Model label override
  --pretty                         Pretty JSON output (only for --format json)
  --provider-api-key-env=<value>   Provider API key env var when creating a new provider entry
  --provider-base-url=<value>      Provider base URL when creating a new provider entry
  --provider-name=<value>          Provider name override when creating a new provider entry
  --timeout=<value>                [default: 15000] Fetch timeout in ms
  --type=<value>                   Model type override (e.g. vercel_ai_gateway, openai_responses, anthropic_messages)

GLOBAL FLAGS
  --json  Format output as json.
```

## `modelsdev models show REF`

Show details for a model

```
USAGE
  $ modelsdev models show REF [--json] [--api-url <value>] [--format human|json] [--pretty | --compact]
    [--timeout <value>]

ARGUMENTS
  REF  providerId/modelId or modelId

FLAGS
  --api-url=<value>  [default: https://models.dev/api.json, env: MODELSDEV_API_URL] API URL, file path, or '-' for stdin
  --compact          Compact JSON output (only for --format json)
  --format=<option>  [default: human] Output format
                     <options: human|json>
  --pretty           Pretty JSON output (only for --format json)
  --timeout=<value>  [default: 15000] Fetch timeout in ms

GLOBAL FLAGS
  --json  Format output as json.
```

## `modelsdev providers list`

List providers from models.dev

```
USAGE
  $ modelsdev providers list [--json] [--api-url <value>] [--format human|json] [--pretty | --compact] [--timeout
    <value>] [--q <value>] [--sort id|name|models] [--limit <value>] [--offset <value>] [-d]

FLAGS
  -d, --details          Show more columns
      --api-url=<value>  [default: https://models.dev/api.json, env: MODELSDEV_API_URL] API URL, file path, or '-' for
                         stdin
      --compact          Compact JSON output (only for --format json)
      --format=<option>  [default: human] Output format
                         <options: human|json>
      --limit=<value>    Limit results
      --offset=<value>   Skip first N results
      --pretty           Pretty JSON output (only for --format json)
      --q=<value>        Filter by provider id or name
      --sort=<option>    [default: id] Sort by id, name, or models
                         <options: id|name|models>
      --timeout=<value>  [default: 15000] Fetch timeout in ms

GLOBAL FLAGS
  --json  Format output as json.
```

## `modelsdev providers show PROVIDERID`

Show details for a provider and its models

```
USAGE
  $ modelsdev providers show PROVIDERID [--json] [--api-url <value>] [--format human|json] [--pretty | --compact]
    [--timeout <value>] [--q <value>] [--limit <value>] [--offset <value>] [-d]

ARGUMENTS
  PROVIDERID  Provider id

FLAGS
  -d, --details          Include full model details
      --api-url=<value>  [default: https://models.dev/api.json, env: MODELSDEV_API_URL] API URL, file path, or '-' for
                         stdin
      --compact          Compact JSON output (only for --format json)
      --format=<option>  [default: human] Output format
                         <options: human|json>
      --limit=<value>    Limit results
      --offset=<value>   Skip first N results
      --pretty           Pretty JSON output (only for --format json)
      --q=<value>        Filter models by id, name, or family
      --timeout=<value>  [default: 15000] Fetch timeout in ms

GLOBAL FLAGS
  --json  Format output as json.
```
