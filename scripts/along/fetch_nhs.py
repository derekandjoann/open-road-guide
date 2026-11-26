"""National Highway System (FHWA, via geo.dot.gov) interstate and US-route
lines for each state, cached as nhs/<fips>.json: [[sign_type, sign_number, [[lng,lat],...]], ...]"""
import json, os, sys, time, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
STATES = json.load(open(os.path.join(HERE, 'states.json')))
BASE = 'https://geo.dot.gov/server/rest/services/National_Highway_System/MapServer/0/query'

def get(params):
    url = BASE + '?' + urllib.parse.urlencode(params)
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'OpenRoadGuide/1.0 (editorial)'}), timeout=120) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(5 + a * 10)
    raise RuntimeError('failed ' + url[:200])

for state, fips in STATES.items():
    path = os.path.join(HERE, 'nhs', f'{fips}.json')
    if os.path.exists(path):
        continue
    where = f"STFIPS={int(fips)} and SIGNT1 in ('I','U')"
    ids = get({'where': where, 'returnIdsOnly': 'true', 'f': 'json'}).get('objectIds') or []
    out = []
    for i in range(0, len(ids), 400):
        d = get({'objectIds': ','.join(map(str, ids[i:i + 400])), 'outFields': 'SIGNT1,SIGNN1', 'outSR': '4326',
                 'returnGeometry': 'true', 'geometryPrecision': '5', 'f': 'json'})
        for f in d.get('features', []):
            g = f.get('geometry') or {}
            for path_ in g.get('paths', []):
                out.append([f['attributes']['SIGNT1'], (f['attributes']['SIGNN1'] or '').strip(), path_])
    json.dump(out, open(path, 'w'))
    print(state, len(ids), len(out), flush=True)
