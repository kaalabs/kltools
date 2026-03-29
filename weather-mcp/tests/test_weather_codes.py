"""Weather code mapping."""

from __future__ import annotations

from weather_mcp.weather_codes import describe_code


def test_clear() -> None:
    label, sym = describe_code(0)
    assert label == "Clear"
    assert sym == "☀"


def test_none() -> None:
    label, sym = describe_code(None)
    assert label == "—"
    assert sym == "·"
