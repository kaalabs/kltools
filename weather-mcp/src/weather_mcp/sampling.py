"""Pick consecutive hourly rows from an Open-Meteo hourly time series."""

from __future__ import annotations

from datetime import UTC, datetime


def _parse_hour(iso: str) -> datetime:
    s = iso
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(UTC)


def sample_consecutive_hourly_indices(
    time_iso: list[str],
    *,
    now: datetime | None = None,
    count: int = 12,
    step_hours: int = 1,
) -> list[int]:
    """
    Return up to ``count`` indices into ``time_iso``, each ``step_hours`` apart on the grid.

    Starts at the first hour at or after ``now`` (compared in UTC). With defaults this yields
    twelve individual 1-hourly forecasts.
    """
    if not time_iso or count < 1 or step_hours < 1:
        return []
    ref = (now or datetime.now(tz=UTC)).astimezone(UTC)
    ref_floor = ref.replace(second=0, microsecond=0)
    start_idx = 0
    for i, t in enumerate(time_iso):
        if _parse_hour(t) >= ref_floor:
            start_idx = i
            break
    else:
        start_idx = max(0, len(time_iso) - 1)
    out: list[int] = []
    i = start_idx
    while i < len(time_iso) and len(out) < count:
        out.append(i)
        i += step_hours
    return out
