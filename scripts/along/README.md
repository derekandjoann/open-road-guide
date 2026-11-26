# Along the Way: how the highway lines are built

Run from this folder. Needs Python with `pyshp`, `shapely` and `networkx`.

1. Census TIGER 2024 primary and secondary roads, one zip per state, unzipped into `tiger/`:
   `https://www2.census.gov/geo/tiger/TIGER2024/PRISECROADS/tl_2024_<fips>_prisecroads.zip` (FIPS codes in `states.json`).
2. `python3 fetch_nhs.py` downloads the FHWA National Highway System lines (geo.dot.gov) into `nhs/`. TIGER files many urban interstate stretches under local freeway names (its I-10 in Texas stops at Houston); the NHS fills them.
3. `python3 build_v3.py [State ...]` writes `lines3.jsonl`: for each interstate (1 or 2 digits) and US highway in a state, a line routed end to end by OpenStreetMap's router (routing.openstreetmap.de, one request a second), with waypoints added where the route misses the highway's own road, until 97% of it is within 1.5 km.
4. Quality check before loading, all four must pass:
   - coverage: at least 90% of the highway's own road within 1.5 km of the line;
   - precision (`precision.py`): at least 90% of the line within 1.5 km of the highway's own road;
   - no backtrack (no point of the line much farther from either end than the ends are apart);
   - the line at most 1.6 times the straight distance between its ends, unless precision is at least 97% (winding mountain roads such as US-129 stay).
   `rerun_held.py` retries held segments with up to 22 routing passes.
   2026-11-26: 699 built; 591 loaded after the precision test removed 86 (I-35 Texas, I-64 Virginia, US-89 Arizona and others) and the rerun added 17. Held: split routes (US-11, US-25, US-31, US-41, US-70 in Tennessee and Kentucky; US-17, US-29 and others) and lines under 5 miles.
5. Load: upload the JSON to Cloudinary (`openroadguide/ops/`), insert into `public.highway_states` with `extensions.http_get`, then recompute labels, counts and `indexable` (see claude/STATUS.md).
