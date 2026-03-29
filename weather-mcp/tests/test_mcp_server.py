"""Regression tests for the headless MCP surface."""

from __future__ import annotations

import asyncio

from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.utilities.tests import run_server_async

from weather_mcp.mcp_server import get_weather_for_place, mcp


def test_mcp_server_exposes_only_weather_tools() -> None:
    tools = asyncio.run(mcp.list_tools())
    names = {tool.name for tool in tools}
    assert names == {"search_cities", "get_forecast", "get_weather_for_place"}


def test_get_weather_for_place_rejects_short_query() -> None:
    assert get_weather_for_place("a") == {
        "error": "query_too_short",
        "message": "Use at least 2 characters.",
    }


def test_mcp_server_list_tools_over_http_smoke() -> None:
    async def exercise() -> None:
        async with run_server_async(mcp, transport="streamable-http") as url:
            async with Client(StreamableHttpTransport(url)) as client:
                result = await client.list_tools_mcp()
        names = {tool.name for tool in result.tools}
        assert names == {"search_cities", "get_forecast", "get_weather_for_place"}

    asyncio.run(exercise())
