# weather-mcp

Stateless headless weather MCP server backed by Open-Meteo.

This project exposes a small Model Context Protocol server for place lookup and weather forecasts without requiring an API key. It is built with FastMCP and can run over `stdio` for local MCP clients or over HTTP transports for remote access.

## Features

- No API key required
- Fuzzy city search via Open-Meteo geocoding
- Current weather conditions
- Next 12 hourly forecast points
- 7-day daily forecast
- `stdio`, `http`, `sse`, and `streamable-http` transports

## Requirements

- Python 3.13+

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

For development tools:

```bash
pip install -e ".[dev]"
```

## Run

Default `stdio` transport:

```bash
weather-mcp
```

Streamable HTTP on port `8765`:

```bash
weather-mcp --transport streamable-http --host 127.0.0.1 --port 8765
```

Other supported transports:

```bash
weather-mcp --transport http
weather-mcp --transport sse
```

## MCP Tools

### `search_cities`

Fuzzy-search place names.

Inputs:

- `query: str`
- `max_results: int = 10`

Returns a list of matching places with:

- `label`
- `name`
- `latitude`
- `longitude`
- `timezone`
- `admin1`
- `country_code`

### `get_forecast`

Fetch weather directly from coordinates.

Inputs:

- `latitude: float`
- `longitude: float`
- `timezone: str = "auto"`

Returns:

- `location`
- `timezone`
- `current`
- `hourly_next_12_hours`
- `daily_7day`

### `get_weather_for_place`

Geocode a place query and fetch weather for the best match.

Input:

- `place_query: str`

If the query is shorter than 2 characters, the tool returns:

```json
{
  "error": "query_too_short",
  "message": "Use at least 2 characters."
}
```

## Example Response Shape

```json
{
  "location": {
    "label": "Berlin, Berlin, DE",
    "latitude": 52.52,
    "longitude": 13.405,
    "timezone": "Europe/Berlin",
    "admin1": "Berlin",
    "country_code": "DE"
  },
  "timezone": "Europe/Berlin",
  "current": {
    "time_iso": "2026-03-29T12:00",
    "temperature_c": 12.3,
    "apparent_c": 10.8,
    "humidity_pct": 61,
    "wind_kmh": 14.1,
    "precipitation_mm": 0.0,
    "weather_code": 1,
    "is_day": true,
    "condition_label": "Mainly clear",
    "condition_symbol": "🌤"
  },
  "hourly_next_12_hours": [],
  "daily_7day": []
}
```

## Docker

Build and run with Docker:

```bash
docker build -t weather-mcp .
docker run --rm -p 8765:8765 weather-mcp
```

Or use Compose:

```bash
docker compose up --build
```

The container starts `streamable-http` on port `8765`.

## Development

Run tests:

```bash
pytest
```

Run linting:

```bash
ruff check .
```

Run type checking:

```bash
mypy
```

## Project Layout

```text
src/weather_mcp/
  mcp_server.py     FastMCP server and tool definitions
  open_meteo.py     Open-Meteo HTTP client and forecast parsing
  sampling.py       Hourly forecast sampling logic
  weather_codes.py  Weather code labels and symbols
tests/
  test_mcp_server.py
  test_sampling.py
  test_weather_codes.py
```
