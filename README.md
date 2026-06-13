# Designed to Thrive - HD Chart API

A self-hosted Human Design chart calculator. No third-party API dependencies.
Built on Swiss Ephemeris (via `pyswisseph`) - the same astronomical engine
professional Human Design software uses.

## What it does

`POST /chart` with `{date, time, location}` returns a full chart:
type, strategy, authority, profile, signature, not-self theme,
defined/open centers, active channels, active gates, and full
planetary positions for both Personality and Design.

## Verified against

The humandesignhub.app reference example
(`1989-03-29 16:05 Asia/Seoul`) returns the documented output:
**Manifestor, 6/2, Emotional**.

## Local development

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8765
```

Then test:

```bash
curl -X POST http://127.0.0.1:8765/chart \
  -H 'Content-Type: application/json' \
  -d '{"date":"1989-03-29","time":"16:05","location":"Seoul, South Korea"}'
```

To point the live site at the local API during development, open the browser
console on `chart.html` and run:

```js
window.HD_API_BASE = 'http://127.0.0.1:8765';
```

(or temporarily set the constant at the top of `assets/js/chart-client.js`.)

## Deploy to Fly.io

Fly.io's free tier covers this (shared-cpu-1x, 256MB, auto-stops when idle).

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Authenticate: `fly auth login`
3. From this `api/` directory:
   ```bash
   fly launch --no-deploy
   ```
   Accept the existing `fly.toml`. Pick a region close to your audience
   (`iad` for US East, `lhr` for UK, etc.).
4. Deploy:
   ```bash
   fly deploy
   ```
5. Fly returns a URL like `https://designedtothrive-chart.fly.dev`. Update
   `HD_API_BASE` in `assets/js/chart-client.js` to that URL.
6. If you want a custom subdomain (e.g. `api.designedtothrive.us`):
   ```bash
   fly certs create api.designedtothrive.us
   ```
   then add the CNAME Fly tells you to your DNS.

## Cost

Fly.io free tier includes up to 3 shared-cpu-1x VMs with 160GB outbound
transfer/month. This single-VM service uses one. Idle most of the time
(auto-stops), wakes in about 250ms on request. Charts are cheap to compute
(no per-call fee, no external API). Expected monthly cost: **$0**.

## Files

- `chart.py` - the calculator (gates, channels, centers, type, authority, profile)
- `main.py` - FastAPI service (geocoding, timezone, CORS, endpoint)
- `Dockerfile` - container build (Python 3.12 slim)
- `fly.toml` - Fly.io deployment config
- `requirements.txt` - Python deps

## License notes

The calculator is adapted from
[geodetheseeker/human-design-py](https://github.com/geodetheseeker/human-design-py)
(MIT). Gate sequence cross-verified against
[barneyandflow.com/gate-zodiac-degrees](https://www.barneyandflow.com/gate-zodiac-degrees).
Swiss Ephemeris is licensed under AGPL or via paid commercial license from
Astrodienst; the Moshier built-in mode this service uses is freely
redistributable.
