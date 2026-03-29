"""Model Context Protocol server for Open-Meteo weather (FastMCP).

Run with ``weather-mcp`` (stdio) or
``weather-mcp --transport streamable-http --port 8765``.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from typing import Any

import httpx
from fastmcp import FastMCP

from weather_mcp.open_meteo import (
    CurrentConditions,
    DailySlice,
    ForecastBundle,
    GeocodeHit,
    HourlySlice,
    fetch_forecast,
    geocode,
)
from weather_mcp.weather_codes import describe_code

mcp = FastMCP(
    "open-meteo-weather",
    instructions=(
        "Weather tools backed by Open-Meteo (no API key). "
        "Search places and fetch forecasts for headless MCP clients."
    ),
)


def _enrich_current(cur: CurrentConditions) -> dict[str, Any]:
    d = asdict(cur)
    lbl, sym = describe_code(cur.weather_code)
    d["condition_label"] = lbl
    d["condition_symbol"] = sym
    return d


def _enrich_hourly(h: HourlySlice) -> dict[str, Any]:
    d = asdict(h)
    lbl, sym = describe_code(h.weather_code)
    d["condition_label"] = lbl
    d["condition_symbol"] = sym
    return d


def _enrich_daily(day: DailySlice) -> dict[str, Any]:
    d = asdict(day)
    lbl, sym = describe_code(day.weather_code)
    d["condition_label"] = lbl
    d["condition_symbol"] = sym
    return d


def _forecast_payload(hit: GeocodeHit, bundle: ForecastBundle) -> dict[str, Any]:
    cur = bundle.current
    return {
        "location": {
            "label": hit.label(),
            "latitude": hit.latitude,
            "longitude": hit.longitude,
            "timezone": hit.timezone,
            "admin1": hit.admin1,
            "country_code": hit.country_code,
        },
        "timezone": bundle.timezone,
        "current": _enrich_current(cur) if cur else None,
        "hourly_next_12_hours": [_enrich_hourly(h) for h in bundle.twelve_hourly],
        "daily_7day": [_enrich_daily(d) for d in bundle.daily],
    }


@mcp.tool
def search_cities(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """Fuzzy-search place names via Open-Meteo geocoding. Use 2+ characters."""
    q = query.strip()
    if len(q) < 2:
        return []
    n = max(1, min(max_results, 50))
    with httpx.Client() as client:
        hits = geocode(client, q, count=n)
    return [
        {
            "label": h.label(),
            "name": h.name,
            "latitude": h.latitude,
            "longitude": h.longitude,
            "timezone": h.timezone,
            "admin1": h.admin1,
            "country_code": h.country_code,
        }
        for h in hits
    ]


@mcp.tool
def get_forecast(
    latitude: float,
    longitude: float,
    timezone: str = "auto",
) -> dict[str, Any]:
    """Current conditions, next 12 hourly steps, and 7-day daily forecast at coordinates."""
    hit = GeocodeHit(
        name=f"{latitude:.4f}°, {longitude:.4f}°",
        latitude=latitude,
        longitude=longitude,
        timezone=timezone.strip() or "auto",
        admin1=None,
        country_code=None,
    )
    with httpx.Client() as client:
        bundle = fetch_forecast(client, hit)
    return _forecast_payload(hit, bundle)


@mcp.tool
def get_weather_for_place(place_query: str) -> dict[str, Any]:
    """Geocode ``place_query`` and return the full forecast for the best match."""
    q = place_query.strip()
    if len(q) < 2:
        return {"error": "query_too_short", "message": "Use at least 2 characters."}
    with httpx.Client() as client:
        hits = geocode(client, q, count=1)
    if not hits:
        return {
            "error": "no_match",
            "message": f"No locations found for {place_query!r}.",
        }
    hit = hits[0]
    with httpx.Client() as client:
        bundle = fetch_forecast(client, hit)
    return _forecast_payload(hit, bundle)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Open-Meteo weather MCP server (FastMCP).",
    )
    parser.add_argument(
        "--transport",
        default="stdio",
        choices=["stdio", "http", "sse", "streamable-http"],
        help="MCP transport (default: stdio for editors and Claude Desktop).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address for HTTP-based transports.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Port for HTTP-based transports.",
    )
    args = parser.parse_args()
    kwargs: dict[str, Any] = {}
    if args.transport != "stdio":
        kwargs["host"] = args.host
        kwargs["port"] = args.port
    mcp.run(transport=args.transport, **kwargs)


if __name__ == "__main__":
    main()
