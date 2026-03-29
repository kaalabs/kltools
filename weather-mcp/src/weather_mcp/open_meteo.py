"""Open-Meteo geocoding and forecast HTTP client."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast

import httpx

from weather_mcp.sampling import sample_consecutive_hourly_indices

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


@dataclass(frozen=True, slots=True)
class GeocodeHit:
    name: str
    latitude: float
    longitude: float
    timezone: str
    admin1: str | None
    country_code: str | None

    def label(self) -> str:
        parts = [self.name]
        if self.admin1:
            parts.append(self.admin1)
        if self.country_code:
            parts.append(self.country_code)
        return ", ".join(parts)


@dataclass(frozen=True, slots=True)
class CurrentConditions:
    time_iso: str
    temperature_c: float | None
    apparent_c: float | None
    humidity_pct: int | None
    wind_kmh: float | None
    precipitation_mm: float | None
    weather_code: int | None
    is_day: bool | None


@dataclass(frozen=True, slots=True)
class HourlySlice:
    time_iso: str
    temperature_c: float | None
    precip_prob_pct: int | None
    wind_kmh: float | None
    weather_code: int | None


@dataclass(frozen=True, slots=True)
class DailySlice:
    date_iso: str
    temp_min_c: float | None
    temp_max_c: float | None
    precip_sum_mm: float | None
    wind_kmh_max: float | None
    weather_code: int | None
    sunrise: str | None
    sunset: str | None


@dataclass(frozen=True, slots=True)
class ForecastBundle:
    timezone: str
    current: CurrentConditions | None
    twelve_hourly: list[HourlySlice]  # 12 consecutive 1-hour slices from now
    daily: list[DailySlice]


def geocode(client: httpx.Client, query: str, *, count: int = 10) -> list[GeocodeHit]:
    if len(query.strip()) < 2:
        return []
    r = client.get(
        GEOCODE_URL,
        params={"name": query.strip(), "count": count, "language": "en"},
        timeout=30.0,
    )
    r.raise_for_status()
    data = cast(dict[str, Any], r.json())
    raw = data.get("results")
    if not isinstance(raw, list):
        return []
    out: list[GeocodeHit] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(
                GeocodeHit(
                    name=str(item["name"]),
                    latitude=float(item["latitude"]),
                    longitude=float(item["longitude"]),
                    timezone=str(item.get("timezone") or "auto"),
                    admin1=item.get("admin1") if isinstance(item.get("admin1"), str) else None,
                    country_code=item.get("country_code")
                    if isinstance(item.get("country_code"), str)
                    else None,
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _f(data: dict[str, Any], key: str) -> float | None:
    v = data.get(key)
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, int | float):
        return float(v)
    return None


def _i(data: dict[str, Any], key: str) -> int | None:
    v = data.get(key)
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, int):
        return int(v)
    return None


def _parse_current(block: dict[str, Any] | None) -> CurrentConditions | None:
    if not block:
        return None
    return CurrentConditions(
        time_iso=str(block.get("time") or ""),
        temperature_c=_f(block, "temperature_2m"),
        apparent_c=_f(block, "apparent_temperature"),
        humidity_pct=_i(block, "relative_humidity_2m"),
        wind_kmh=_f(block, "wind_speed_10m"),
        precipitation_mm=_f(block, "precipitation"),
        weather_code=_i(block, "weather_code"),
        is_day=bool(block["is_day"]) if isinstance(block.get("is_day"), int) else None,
    )


def _hourly_list(block: dict[str, Any], key: str) -> list[Any]:
    v = block.get(key)
    return list(v) if isinstance(v, list) else []


def fetch_forecast(
    client: httpx.Client,
    hit: GeocodeHit,
    *,
    now: datetime | None = None,
) -> ForecastBundle:
    params: dict[str, str | int | float] = {
        "latitude": hit.latitude,
        "longitude": hit.longitude,
        "timezone": hit.timezone,
        "forecast_days": 10,
        "current": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
                "is_day",
            ]
        ),
        "hourly": ",".join(
            [
                "temperature_2m",
                "precipitation_probability",
                "weather_code",
                "wind_speed_10m",
            ]
        ),
        "daily": ",".join(
            [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "wind_speed_10m_max",
                "sunrise",
                "sunset",
            ]
        ),
    }
    r = client.get(FORECAST_URL, params=params, timeout=30.0)
    r.raise_for_status()
    payload = cast(dict[str, Any], r.json())

    raw_cur = payload.get("current")
    cur = _parse_current(raw_cur if isinstance(raw_cur, dict) else None)

    hourly_raw = payload.get("hourly")
    hourly_d: dict[str, Any] = hourly_raw if isinstance(hourly_raw, dict) else {}
    times = [str(t) for t in _hourly_list(hourly_d, "time")]
    temps = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(hourly_d, "temperature_2m")
    ]
    probs = [
        int(x) if isinstance(x, int) else None
        for x in _hourly_list(hourly_d, "precipitation_probability")
    ]
    codes = [int(x) if isinstance(x, int) else None for x in _hourly_list(hourly_d, "weather_code")]
    winds = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(hourly_d, "wind_speed_10m")
    ]

    idxs = sample_consecutive_hourly_indices(times, now=now, count=12, step_hours=1)
    twelve: list[HourlySlice] = []
    for i in idxs:
        if i < len(times):
            twelve.append(
                HourlySlice(
                    time_iso=times[i],
                    temperature_c=temps[i] if i < len(temps) else None,
                    precip_prob_pct=probs[i] if i < len(probs) else None,
                    wind_kmh=winds[i] if i < len(winds) else None,
                    weather_code=codes[i] if i < len(codes) else None,
                )
            )

    daily_raw = payload.get("daily")
    daily_d: dict[str, Any] = daily_raw if isinstance(daily_raw, dict) else {}
    d_times = [str(t) for t in _hourly_list(daily_d, "time")]
    d_wc = [int(x) if isinstance(x, int) else None for x in _hourly_list(daily_d, "weather_code")]
    d_tmax = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(daily_d, "temperature_2m_max")
    ]
    d_tmin = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(daily_d, "temperature_2m_min")
    ]
    d_p = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(daily_d, "precipitation_sum")
    ]
    d_w = [
        float(x) if isinstance(x, int | float) else None
        for x in _hourly_list(daily_d, "wind_speed_10m_max")
    ]
    d_sr = [str(x) for x in _hourly_list(daily_d, "sunrise")]
    d_ss = [str(x) for x in _hourly_list(daily_d, "sunset")]

    daily_out: list[DailySlice] = []
    for i in range(min(7, len(d_times))):
        daily_out.append(
            DailySlice(
                date_iso=d_times[i],
                temp_min_c=d_tmin[i] if i < len(d_tmin) else None,
                temp_max_c=d_tmax[i] if i < len(d_tmax) else None,
                precip_sum_mm=d_p[i] if i < len(d_p) else None,
                wind_kmh_max=d_w[i] if i < len(d_w) else None,
                weather_code=d_wc[i] if i < len(d_wc) else None,
                sunrise=d_sr[i] if i < len(d_sr) else None,
                sunset=d_ss[i] if i < len(d_ss) else None,
            )
        )

    return ForecastBundle(
        timezone=str(payload.get("timezone") or hit.timezone),
        current=cur,
        twelve_hourly=twelve,
        daily=daily_out,
    )
