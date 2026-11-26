# Along the Way: how the highway lines are built

Run from this folder. Needs Python with `pyshp`, `shapely` and `networkx`.

1. Census TIGER 2024 primary and secondary roads, one zip per state, unzipped into `tiger/`:
   `https://www2.census.gov/geo/tiger/TIGER2024/PRISECROADS/tl_2024_<fips>_prisecroads.zip` (FIPS codes in `states.json`).
2. `python3 fetch_nhs.py` downloads the FHWA National Highway System lines (geo.dot.gov) into `nhs/`. TIGER files many urban interstate stretches under local freeway names (its I-10 in Texas stops at Houston); the NHS fills them.
3. `python3 build_v3.py [State ...]` writes `lines3.jsonl`: for each interstate (1 or 2 digits) and US highway in a state, a line routed end to end by OpenStreetMap's router (routing.openstreetmap.de, one request a second), with waypoints added where the route misses the highway's own road, until 97% of it is within 1.5 km.
4. Quality check before loading: coverage at least 0.9, no backtrack, at least 5 miles. On 2026-11-26: 699 built, 660 loaded, 39 held (mostly US routes with split branches such as US-70N/70S).
5. Load: upload the JSON to Cloudinary (`openroadguide/ops/`), insert into `public.highway_states` with `extensions.http_get`, then recompute labels, counts and `indexable` (see claude/STATUS.md).
