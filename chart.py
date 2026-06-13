#!/usr/bin/env python3
"""
Human Design chart calculator.
Adapted from https://github.com/geodetheseeker/human-design-py (MIT License).
Uses pyswisseph for astronomical calculations.
"""

import swisseph as swe
import math

# Use Moshier built-in ephemeris (no external files needed). Sub-arcsecond
# accurate for the planets we use, far below the resolution of HD gates.
swe.set_ephe_path('')

# ─────────────────────────────────────────────
# Gate wheel: starts at 28°15' Pisces (358.25°) with Gate 25.
# Each gate spans 5.625°, each line 0.9375°.
# Source: barneyandflow.com/gate-zodiac-degrees (cross-verified).
# ─────────────────────────────────────────────
GATE_SEQUENCE = [
    25, 17, 21, 51, 42,  3,   # Aries
    27, 24,  2, 23,  8, 20,   # Taurus + into Gemini
    16, 35, 45, 12, 15, 52,   # Gemini + into Cancer
    39, 53, 62, 56, 31, 33,   # Cancer + into Leo
     7,  4, 29, 59, 40, 64,   # Leo + into Virgo
    47,  6, 46, 18, 48, 57,   # Virgo + into Libra
    32, 50, 28, 44,  1, 43,   # Libra + into Scorpio
    14, 34,  9,  5, 26, 11,   # Scorpio + into Sagittarius
    10, 58, 38, 54, 61, 60,   # Sagittarius + into Capricorn
    41, 19, 13, 49, 30, 55,   # Capricorn + into Aquarius
    37, 63, 22, 36            # Pisces
]
assert len(GATE_SEQUENCE) == 64
HD_START_DEGREE = 358.25  # 28°15' Pisces

GATE_SIZE = 360 / 64       # 5.625
LINE_SIZE = GATE_SIZE / 6  # 0.9375

# Centers and the gates that live in them.
CENTERS = {
    "Head":         [61, 63, 64],
    "Ajna":         [4, 11, 17, 24, 43, 47],
    "Throat":       [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62],
    "G":            [1, 2, 7, 10, 13, 15, 25, 46],
    "Heart":        [21, 26, 40, 51],
    "Solar Plexus": [6, 22, 30, 36, 37, 49, 55],
    "Sacral":       [3, 5, 9, 14, 27, 29, 34, 42, 59],
    "Spleen":       [18, 28, 32, 44, 48, 50, 57],
    "Root":         [19, 38, 39, 41, 52, 53, 54, 58, 60],
}

# 36 standard channels: each connects two gates (and therefore two centers).
CHANNELS = [
    (1, 8), (2, 14), (3, 60), (4, 63), (5, 15),
    (6, 59), (7, 31), (9, 52), (10, 20), (10, 34),
    (10, 57), (11, 56), (12, 22), (13, 33), (16, 48),
    (17, 62), (18, 58), (19, 49), (20, 34), (20, 57),
    (21, 45), (23, 43), (24, 61), (25, 51), (26, 44),
    (27, 50), (28, 38), (29, 46), (30, 41), (32, 54),
    (34, 57), (35, 36), (37, 40), (39, 55), (42, 53),
    (47, 64),
]

# Reverse lookup: gate -> center
GATE_TO_CENTER = {}
for center, gates in CENTERS.items():
    for g in gates:
        GATE_TO_CENTER[g] = center

# Channel -> (center A, center B)
CHANNEL_CENTERS = {ch: (GATE_TO_CENTER[ch[0]], GATE_TO_CENTER[ch[1]]) for ch in CHANNELS}

MOTORS = {"Sacral", "Heart", "Solar Plexus", "Root"}


def degree_to_gate_line(degree):
    """Ecliptic longitude (0-360) → (gate, line)."""
    adjusted = (degree - HD_START_DEGREE) % 360
    index = int(adjusted / GATE_SIZE)
    line = int((adjusted % GATE_SIZE) / LINE_SIZE) + 1
    return GATE_SEQUENCE[index], line


# Bodies HD uses. The order matters for display (Sun/Earth pair, then Nodes, then planets).
PLANET_IDS = [
    ("Sun",      swe.SUN),
    ("Earth",    None),           # opposite Sun
    ("N. Node",  swe.TRUE_NODE),
    ("S. Node",  None),           # opposite N. Node
    ("Moon",     swe.MOON),
    ("Mercury",  swe.MERCURY),
    ("Venus",    swe.VENUS),
    ("Mars",     swe.MARS),
    ("Jupiter",  swe.JUPITER),
    ("Saturn",   swe.SATURN),
    ("Uranus",   swe.URANUS),
    ("Neptune",  swe.NEPTUNE),
    ("Pluto",    swe.PLUTO),
]


def planet_positions(jd):
    """Compute (gate, line, degree) for every HD body at a given Julian Day."""
    out = {}
    sun_deg = swe.calc_ut(jd, swe.SUN)[0][0]
    node_deg = swe.calc_ut(jd, swe.TRUE_NODE)[0][0]
    for name, pid in PLANET_IDS:
        if name == "Earth":
            deg = (sun_deg + 180) % 360
        elif name == "S. Node":
            deg = (node_deg + 180) % 360
        else:
            deg = swe.calc_ut(jd, pid)[0][0]
        gate, line = degree_to_gate_line(deg)
        out[name] = {"degree": deg, "gate": gate, "line": line}
    return out


def find_design_jd(jd_birth):
    """Find the UT moment when the Sun was exactly 88° behind the birth Sun.
    Binary search bounded ~80-100 days before birth."""
    p_sun = swe.calc_ut(jd_birth, swe.SUN)[0][0]
    target = (p_sun - 88) % 360
    lo, hi = jd_birth - 100, jd_birth - 80
    mid = (lo + hi) / 2
    for _ in range(60):
        mid = (lo + hi) / 2
        s = swe.calc_ut(mid, swe.SUN)[0][0]
        # Signed angular diff in [-180, 180]
        diff = ((s - target + 180) % 360) - 180
        if abs(diff) < 1e-6:
            break
        if diff > 0:
            hi = mid
        else:
            lo = mid
    return mid


def defined_centers(active_gates):
    """Centers that have at least one fully-activated channel connecting to them."""
    gset = set(active_gates)
    defined = set()
    active_channels = []
    for ch in CHANNELS:
        if ch[0] in gset and ch[1] in gset:
            active_channels.append(ch)
            ca, cb = CHANNEL_CENTERS[ch]
            defined.add(ca)
            defined.add(cb)
    return defined, active_channels


def _motor_reaches_throat(defined, active_channels):
    """BFS from any defined motor across defined channels - does it reach the Throat?"""
    if "Throat" not in defined:
        return False
    # Build adjacency from active channels (only between defined centers).
    adj = {c: set() for c in CENTERS}
    for ch in active_channels:
        a, b = CHANNEL_CENTERS[ch]
        adj[a].add(b)
        adj[b].add(a)
    seen = set()
    stack = [c for c in MOTORS if c in defined]
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        if node == "Throat":
            return True
        stack.extend(adj[node] - seen)
    return False


def determine_type(defined, active_channels):
    if not defined:
        return "Reflector"
    has_sacral = "Sacral" in defined
    motor_to_throat = _motor_reaches_throat(defined, active_channels)
    if has_sacral and motor_to_throat:
        return "Manifesting Generator"
    if has_sacral:
        return "Generator"
    if motor_to_throat:
        return "Manifestor"
    return "Projector"


STRATEGY = {
    "Manifestor": "To Inform",
    "Generator": "To Respond",
    "Manifesting Generator": "To Respond, then Inform",
    "Projector": "Wait for the Invitation",
    "Reflector": "Wait a Lunar Cycle",
}

SIGNATURE = {
    "Manifestor": "Peace",
    "Generator": "Satisfaction",
    "Manifesting Generator": "Satisfaction and Peace",
    "Projector": "Success",
    "Reflector": "Surprise",
}

NOT_SELF_THEME = {
    "Manifestor": "Anger",
    "Generator": "Frustration",
    "Manifesting Generator": "Frustration and Anger",
    "Projector": "Bitterness",
    "Reflector": "Disappointment",
}


def determine_authority(hd_type, defined, active_channels):
    """Inner Authority hierarchy. Returns a short label."""
    if hd_type == "Reflector":
        return "Lunar"
    if "Solar Plexus" in defined:
        return "Emotional (Solar Plexus)"
    if "Sacral" in defined:
        return "Sacral"
    if "Spleen" in defined:
        return "Splenic"
    if "Heart" in defined:
        # Heart authority requires Heart-Throat connection (Manifestors) for "Ego Manifested".
        if hd_type == "Manifestor":
            return "Ego Manifested"
        return "Ego Projected"
    if "G" in defined:
        return "Self-Projected"
    # No defined awareness centers: mental projector.
    return "Mental (Sounding Board)"


def calculate_chart(birth_year, birth_month, birth_day, birth_hour, birth_minute, utc_offset):
    """Calculate a complete Human Design chart.
    utc_offset is hours east of UTC (positive east, negative west). DST should already
    be folded in by the caller."""
    utc_hour_float = (birth_hour - utc_offset) + birth_minute / 60.0
    jd_p = swe.julday(birth_year, birth_month, birth_day, utc_hour_float)
    jd_d = find_design_jd(jd_p)

    personality = planet_positions(jd_p)
    design = planet_positions(jd_d)

    active_gates = set()
    for d in (personality, design):
        for body in d.values():
            active_gates.add(body["gate"])

    defined, active_channels = defined_centers(active_gates)
    hd_type = determine_type(defined, active_channels)
    authority = determine_authority(hd_type, defined, active_channels)
    profile = f"{personality['Sun']['line']}/{design['Sun']['line']}"

    return {
        "type": hd_type,
        "strategy": STRATEGY[hd_type],
        "authority": authority,
        "profile": profile,
        "signature": SIGNATURE[hd_type],
        "not_self_theme": NOT_SELF_THEME[hd_type],
        "defined_centers": sorted(defined),
        "undefined_centers": sorted(set(CENTERS) - defined),
        "active_channels": [list(ch) for ch in active_channels],
        "active_gates": sorted(active_gates),
        "personality": personality,
        "design": design,
    }


if __name__ == "__main__":
    # Quick self-check: Oprah Winfrey, Jan 29 1954, 04:30 CST (UTC-6), Kosciusko MS.
    # Public chart: Manifesting Generator, 3/5, Sacral authority.
    import json
    result = calculate_chart(1954, 1, 29, 4, 30, -6)
    print("OPRAH (expected: MG, 3/5, Sacral)")
    print(f"  type:      {result['type']}")
    print(f"  profile:   {result['profile']}")
    print(f"  authority: {result['authority']}")
    print(f"  strategy:  {result['strategy']}")
    print(f"  defined:   {result['defined_centers']}")
