"""WMO weather interpretation codes (Open-Meteo) → short label + symbol."""

from __future__ import annotations


def describe_code(code: int | None) -> tuple[str, str]:
    """Return (short_label, unicode_symbol) for a WMO code."""
    if code is None:
        return "—", "·"
    c = int(code)
    if c == 0:
        return "Clear", "☀"
    if c in (1, 2, 3):
        return "Mainly clear", "🌤"
    if c in (45, 48):
        return "Fog", "🌫"
    if c in (51, 53, 55, 56, 57):
        return "Drizzle", "🌦"
    if c in (61, 63, 65, 66, 67, 80, 81, 82):
        return "Rain", "🌧"
    if c in (71, 73, 75, 77, 85, 86):
        return "Snow", "❄"
    if c in (95, 96, 99):
        return "Thunderstorm", "⛈"
    return "Mixed", "☁"
