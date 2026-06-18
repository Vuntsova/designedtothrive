"""
The Design Reader - Human Design chart API.

POST /chart with birth data, returns full HD chart (type/strategy/authority/profile
+ defined centers, channels, gates, and personality/design planetary positions).

Geocoding via Nominatim (free, attributed). Timezone via offline timezonefinder.
Calculation via Swiss Ephemeris (pyswisseph, Moshier mode).
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import os

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from timezonefinder import TimezoneFinder

from chart import calculate_chart

app = FastAPI(
    title="The Design Reader - HD Chart API",
    description="Human Design chart calculator. Self-hosted Swiss Ephemeris.",
    version="1.0.0",
)

# CORS: production domain + any local dev port. Production allowlist is exact.
ALLOWED_ORIGINS = [
    "https://thedesignreader.com",
    "https://www.thedesignreader.com",
]
# Also honor any extra origin from env (useful for Netlify preview deploys).
extra = os.environ.get("EXTRA_ORIGIN")
if extra:
    ALLOWED_ORIGINS.append(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Regex covers any localhost / 127.0.0.1 / [::1] on any port, for local dev.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# Reusable services (initialized once).
TZF = TimezoneFinder()

# LocationIQ geocoding. Key comes from the LOCATIONIQ_KEY env var (set on Render).
LOCATIONIQ_KEY = os.environ.get("LOCATIONIQ_KEY", "")
LOCATIONIQ_URL = "https://us1.locationiq.com/v1/search"


def locationiq_search(query: str, limit: int = 1):
    """Call LocationIQ forward geocoding. Returns a list of result dicts
    (LocationIQ uses the same shape as Nominatim: lat, lon, class, type, address).
    Raises RuntimeError on a transport/HTTP error so callers can map it to a 503."""
    if not LOCATIONIQ_KEY:
        raise RuntimeError("Geocoder is not configured.")
    params = {
        "key": LOCATIONIQ_KEY,
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": limit,
        "accept-language": "en",
        "normalizecity": 1,
    }
    try:
        resp = requests.get(LOCATIONIQ_URL, params=params, timeout=8)
    except requests.RequestException as e:
        raise RuntimeError(str(e))
    # LocationIQ returns 404 with a JSON body when nothing matches - treat as no results.
    if resp.status_code == 404:
        return []
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")
    try:
        data = resp.json()
    except ValueError:
        return []
    return data if isinstance(data, list) else []


class ChartRequest(BaseModel):
    date: str = Field(..., description="ISO date, e.g. 1989-03-29")
    time: str = Field(..., description="24h time, e.g. 16:05")
    location: str = Field(..., description="City, country, e.g. 'Seoul, South Korea'")
    name: str | None = Field(None, description="Optional, for personalization")


# Acceptable Nominatim (class, type) pairs for a birth location.
# Surveyed against real cities worldwide - everything legitimate resolves to one of these.
# Excludes: neighbourhood, suburb, quarter, hamlet, locality, building, amenity, highway, etc.
ALLOWED_PLACE_PAIRS = {
    ("boundary", "administrative"),  # most cities/states/countries
    ("place", "city"),               # some major cities (Mumbai, Sydney, Lagos)
    ("place", "town"),
    ("place", "village"),
    ("place", "municipality"),
    ("place", "island"),
    ("place", "country"),
}


def resolve_birth_moment(date_str: str, time_str: str, location: str):
    """Turn date+time+place into (year, month, day, hour, minute, utc_offset_hours, geo_info)."""
    # Strip and validate location text up front - bad input should never reach the geocoder.
    location = (location or "").strip()
    if len(location) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please enter a birth location like 'Chicago, USA' or 'Sofia, Bulgaria'.",
        )

    # Parse local date+time.
    try:
        local_dt = datetime.fromisoformat(f"{date_str}T{time_str}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad date or time format.")

    # Geocode location -> lat/lng via LocationIQ.
    try:
        results = locationiq_search(location, limit=1)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"Geocoder error: {e}")
    if not results:
        raise HTTPException(
            status_code=400,
            detail=f"Could not find location '{location}'. Try 'City, Country'.",
        )
    geo = results[0]
    geo_lat = float(geo["lat"])
    geo_lng = float(geo["lon"])

    # Reject buildings, streets, neighbourhoods, and random POIs - we want a real
    # city-level place so we can be confident about the timezone.
    pair = (geo.get("class", ""), geo.get("type", ""))
    if pair not in ALLOWED_PLACE_PAIRS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{location}' did not resolve to a recognizable city or town. "
                "Please enter your birth city like 'Chicago, USA' or 'Sofia, Bulgaria'."
            ),
        )

    # Timezone from coordinates (historical-DST-aware via zoneinfo).
    tz_name = TZF.timezone_at(lat=geo_lat, lng=geo_lng)
    if not tz_name:
        raise HTTPException(
            status_code=400,
            detail="Could not determine timezone for this location.",
        )

    # Attach the historical timezone (DST rules apply per birth date), then offset to UTC.
    try:
        local_aware = local_dt.replace(tzinfo=ZoneInfo(tz_name))
    except Exception:
        raise HTTPException(status_code=500, detail=f"Bad timezone: {tz_name}")
    utc_offset_hours = local_aware.utcoffset().total_seconds() / 3600

    return {
        "year": local_dt.year,
        "month": local_dt.month,
        "day": local_dt.day,
        "hour": local_dt.hour,
        "minute": local_dt.minute,
        "utc_offset": utc_offset_hours,
        "geo": {
            "input": location,
            "resolved_name": geo.get("display_name", ""),
            "lat": geo_lat,
            "lng": geo_lng,
            "timezone": tz_name,
            "utc_offset_hours": utc_offset_hours,
        },
    }


@app.get("/")
def root():
    return {"service": "designedtothrive-hd-chart", "ok": True}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/geocode")
def geocode(q: str = ""):
    """Return up to 5 city-level suggestions for an as-you-type birth location.
    Used by the chart form's autocomplete dropdown."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}

    try:
        candidates = locationiq_search(q, limit=8)
    except RuntimeError:
        return {"results": []}

    if not candidates:
        return {"results": []}

    out = []
    for r in candidates:
        pair = (r.get("class", ""), r.get("type", ""))
        if pair not in ALLOWED_PLACE_PAIRS:
            continue
        # Build a clean "City, Region, Country" label from address parts instead
        # of the full raw address (which includes county, postcode, etc.).
        addr = r.get("address", {}) or {}
        city = (addr.get("city") or addr.get("town") or addr.get("village")
                or addr.get("municipality") or addr.get("hamlet")
                or addr.get("county") or "")
        region = addr.get("state") or addr.get("region") or ""
        country = addr.get("country") or ""
        parts = [p for p in (city, region, country) if p]
        clean = ", ".join(dict.fromkeys(parts))  # join, drop duplicates, keep order
        out.append({
            "display_name": clean or r.get("display_name", ""),
            "lat": float(r["lat"]),
            "lng": float(r["lon"]),
        })
        if len(out) >= 5:
            break
    return {"results": out}


@app.post("/chart")
def chart(req: ChartRequest):
    moment = resolve_birth_moment(req.date, req.time, req.location)
    chart_data = calculate_chart(
        birth_year=moment["year"],
        birth_month=moment["month"],
        birth_day=moment["day"],
        birth_hour=moment["hour"],
        birth_minute=moment["minute"],
        utc_offset=moment["utc_offset"],
    )
    return {
        "input": {
            "name": req.name,
            "date": req.date,
            "time": req.time,
            "location": req.location,
        },
        "birth_info": moment["geo"],
        "chart": chart_data,
    }
