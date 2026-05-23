"""Historical weather retrieval."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from weather_mcp.open_meteo import (
    GeocodeHit,
    OpenMeteoHistoricalUnavailable,
    fetch_historical_weather,
)


def _hit() -> GeocodeHit:
    return GeocodeHit(
        name="Berlin",
        latitude=52.52,
        longitude=13.41,
        timezone="Europe/Berlin",
        admin1="Berlin",
        country_code="DE",
    )


def _history_payload() -> dict[str, object]:
    return {
        "timezone": "Europe/Berlin",
        "daily": {
            "time": ["2026-05-21", "2026-05-22"],
            "weather_code": [80, 3],
            "temperature_2m_max": [20.5, 23.6],
            "temperature_2m_min": [11.7, 12.6],
            "precipitation_sum": [1.2, 0.0],
            "wind_speed_10m_max": [11.2, 9.3],
        },
    }


def test_fetch_historical_weather_uses_forecast_api_for_recent_ranges() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url.host == "api.open-meteo.com"
        assert request.url.path == "/v1/forecast"
        return httpx.Response(200, json=_history_payload())

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        bundle = fetch_historical_weather(
            client,
            _hit(),
            start_date="2026-05-21",
            end_date="2026-05-22",
            now=datetime(2026, 5, 23, tzinfo=UTC),
        )

    assert bundle.source == "forecast_recent_history"
    assert [d.date_iso for d in bundle.daily] == ["2026-05-21", "2026-05-22"]
    assert bundle.daily[0].weather_code == 80
    assert bundle.daily[1].temp_max_c == 23.6

    query = parse_qs(urlparse(str(requests[0].url)).query)
    assert query["start_date"] == ["2026-05-21"]
    assert query["end_date"] == ["2026-05-22"]
    assert query["forecast_days"] == ["0"]
    assert query["daily"] == [
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"
    ]


def test_fetch_historical_weather_uses_customer_archive_when_api_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []
    monkeypatch.setenv("OPEN_METEO_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url.host == "customer-api.open-meteo.com"
        assert request.url.path == "/v1/archive"
        return httpx.Response(200, json=_history_payload())

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        bundle = fetch_historical_weather(
            client,
            _hit(),
            start_date="2024-01-01",
            end_date="2024-01-02",
            now=datetime(2026, 5, 23, tzinfo=UTC),
        )

    assert bundle.source == "archive_history"
    query = parse_qs(urlparse(str(requests[0].url)).query)
    assert query["apikey"] == ["test-key"]


def test_fetch_historical_weather_reports_free_archive_outage() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "archive-api.open-meteo.com"
        return httpx.Response(504, text="<html><h1>504 Gateway Time-out</h1></html>")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(
            OpenMeteoHistoricalUnavailable,
            match="free Historical API is unavailable",
        ):
            fetch_historical_weather(
                client,
                _hit(),
                start_date="2024-01-01",
                end_date="2024-01-02",
                now=datetime(2026, 5, 23, tzinfo=UTC),
            )


def test_fetch_historical_weather_rejects_invalid_ranges_before_http() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="start_date must be on or before end_date"):
            fetch_historical_weather(
                client,
                _hit(),
                start_date="2026-05-22",
                end_date="2026-05-21",
                now=datetime(2026, 5, 23, tzinfo=UTC),
            )

    assert called is False
