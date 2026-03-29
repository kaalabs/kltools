"""Tests for hourly index sampling."""

from __future__ import annotations

from datetime import UTC, datetime

from weather_mcp.sampling import sample_consecutive_hourly_indices


def test_twelve_consecutive_one_hour_steps() -> None:
    times = [f"2026-01-01T{i:02d}:00:00Z" for i in range(0, 48)]
    ref = datetime(2026, 1, 1, 5, 0, tzinfo=UTC)
    idx = sample_consecutive_hourly_indices(times, now=ref, count=12, step_hours=1)
    assert idx == list(range(5, 17))


def test_sample_empty() -> None:
    assert sample_consecutive_hourly_indices([], now=None) == []
