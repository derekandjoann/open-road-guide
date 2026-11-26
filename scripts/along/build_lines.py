"""Build one ordered, drivable line per (state, interstate or US highway).

Census TIGER 2024 primary and secondary roads give each highway's pieces in a
state. Where two routes share pavement TIGER files it under one name only, so
a highway's own pieces have gaps. We order the pieces, sample waypoints along
them (with the direction of travel, so the router keeps to the right side of
a divided road), and let OSRM drive through them: it fills each gap with the
road the highway really shares.

Output: lines.jsonl, one object per (state, highway).
Usage: python3 build_lines.py [State ...]
"""
import json, math, re, sys, time, urllib.request, os
import shapefile, networkx as nx
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
STATES = json.load(open(os.path.join(HERE, 'states.json')))
OUT = os.path.join(HERE, 'lines2.jsonl')
ROUTER = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
UA = 'OpenRoadGuide/1.0 (+https://openroadguide.com/plan)'

NAME_RE = re.compile(r'^(?:[NSEW] )?(I-|US Hwy )\s*(\d{1,3}[A-Z]?)$')
R = 6371008.8


def hav(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def bearing(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lng2 - lng1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lng2 - lng1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def route_key(fullname):
    m = NAME_RE.match(fullname.strip())
    if not m:
        return None
    kind, num = m.group(1), m.group(2)
    if kind == 'I-':
        if not num.isdigit() or len(num) > 2:  # 3-digit interstates are city loops and spurs
            return None
        return ('i-' + num.lower(), 'Interstate ' + num, 'interstate', int(num))
    n = int(re.match(r'\d+', num).group())
    return ('us-' + num.lower(), 'US Highway ' + num, 'us', n)


def pieces_for(segments):
    """Graph the segments, then take each connected part's longest path."""
    g = nx.Graph()
    key = lambda p: (round(p[0], 5), round(p[1], 5))
    for seg in segments:
        for a, b in zip(seg, seg[1:]):
            ka, kb = key(a), key(b)
            if ka != kb:
                g.add_edge(ka, kb, w=hav(ka, kb))
    out = []
    for comp in nx.connected_components(g):
        sub = g.subgraph(comp)
        start = next(iter(comp))
        d1 = nx.single_source_dijkstra_path_length(sub, start, weight='w')
        far = max(d1, key=d1.get)
        d2, paths = nx.single_source_dijkstra(sub, far, weight='w')
        far2 = max(d2, key=d2.get)
        path = paths[far2]
        if d2[far2] >= 300:  # ignore stubs under 300 m
            out.append({'coords': path, 'len': d2[far2]})
    return out


def drop_twins(pieces, tol_m=600):
    """Divided highways are drawn once per direction. Keep the longest pieces
    and drop any piece that mostly runs within 600 m of one already kept."""
    if not pieces:
        return pieces
    lat0 = math.radians(sum(p['coords'][0][1] for p in pieces) / len(pieces))
    kx, ky = 111320 * math.cos(lat0), 110540
    proj = lambda c: (c[0] * kx, c[1] * ky)
    kept, geoms = [], []
    for pc in sorted(pieces, key=lambda p: -p['len']):
        pts = [proj(c) for c in pc['coords'][:: max(1, len(pc['coords']) // 60)]]
        if geoms:
            tree = STRtree(geoms)
            near = 0
            for xy in pts:
                pt = Point(xy)
                idx = tree.query(pt.buffer(tol_m))
                if any(geoms[i].distance(pt) <= tol_m for i in idx):
                    near += 1
            if near / len(pts) >= 0.6:
                continue
        kept.append(pc)
        geoms.append(LineString([proj(c) for c in pc['coords']]) if len(pc['coords']) > 1 else Point(proj(pc['coords'][0])))
    return kept


def order_pieces(pieces, axis_ns, max_gap_m=150000):
    """Order pieces along the highway's overall line: find the two piece ends
    farthest apart, orient them by convention (south to north for odd
    numbers, west to east for even), sort pieces by where their middles fall
    on that line, and point each piece forward. Pieces cut off from the rest
    by more than 150 km (old alignments TIGER still names) are dropped: the
    longest connected run is kept."""
    if not pieces:
        return [], []
    ends = [c for pc in pieces for c in (pc['coords'][0], pc['coords'][-1])]
    # farthest pair of ends (pieces are few; ends are at most a few hundred)
    best = (0, ends[0], ends[-1])
    for i in range(len(ends)):
        for j in range(i + 1, len(ends)):
            d = hav(ends[i], ends[j])
            if d > best[0]:
                best = (d, ends[i], ends[j])
    _, A, B = best
    key = (lambda p: p[1]) if axis_ns else (lambda p: p[0])
    if key(A) > key(B):
        A, B = B, A
    lat0 = math.radians((A[1] + B[1]) / 2)
    vx, vy = (B[0] - A[0]) * math.cos(lat0), B[1] - A[1]
    norm = math.hypot(vx, vy) or 1.0
    t = lambda c: ((c[0] - A[0]) * math.cos(lat0) * vx + (c[1] - A[1]) * vy) / norm
    oriented = []
    for pc in pieces:
        co = pc['coords']
        if t(co[0]) > t(co[-1]):
            co = co[::-1]
        mid = co[len(co) // 2]
        oriented.append({'coords': co, 'len': pc['len'], 't': t(mid)})
    oriented.sort(key=lambda p: p['t'])
    runs, cur = [], [oriented[0]]
    for pc in oriented[1:]:
        if hav(cur[-1]['coords'][-1], pc['coords'][0]) > max_gap_m:
            runs.append(cur)
            cur = [pc]
        else:
            cur.append(pc)
    runs.append(cur)
    run = max(runs, key=lambda r: sum(p['len'] for p in r))
    chain = [p['coords'] for p in run]
    gaps = [hav(a[-1], b[0]) for a, b in zip(chain, chain[1:])]
    return chain, gaps


def waypoints(chain, every_m=40000):
    """Points along the chain every ~40 km plus each piece's ends, with the
    direction of travel at each."""
    pts = []
    for coords in chain:
        acc = every_m  # force the piece's first point
        for k in range(len(coords)):
            if k:
                acc += hav(coords[k - 1], coords[k])
            last = k == len(coords) - 1
            if acc >= every_m or last:
                a = coords[max(0, k - 3)]
                b = coords[min(len(coords) - 1, k + 3)]
                if a == b:
                    continue
                pts.append((coords[k], bearing(a, b)))
                acc = 0
    # drop points closer than 2 km to the previous one (piece joins)
    out = []
    for p in pts:
        if out and hav(out[-1][0], p[0]) < 2000:
            continue
        out.append(p)
    return out


def osrm(pts):
    coords = ';'.join(f'{p[0][0]:.5f},{p[0][1]:.5f}' for p in pts)
    bear = ';'.join(f'{round(p[1]) % 360},60' for p in pts)
    url = f'{ROUTER}{coords}?overview=full&geometries=geojson&steps=false&continue_straight=true&bearings={bear}&radiuses=' + ';'.join('2000' for _ in pts)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://openroadguide.com/'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
            time.sleep(1.6)
            if body.get('code') != 'Ok':
                return None, body.get('code')
            rt = body['routes'][0]
            return rt, None
        except Exception as e:  # noqa: BLE001
            time.sleep(10 + attempt * 20)
            err = str(e)
    return None, err


def drive(pts):
    """OSRM through the waypoints, 25 at a time, joined end to end."""
    line, dist = [], 0.0
    i = 0
    while i < len(pts) - 1:
        chunk = pts[i:i + 25]
        rt, err = osrm(chunk)
        if not rt:
            return None, None, err
        g = rt['geometry']['coordinates']
        line.extend(g if not line else g[1:])
        dist += rt['distance']
        i += 24
    return line, dist, None


def simplify(coords, tol=0.0002):
    ls = LineString(coords).simplify(tol, preserve_topology=False)
    return [[round(x, 5), round(y, 5)] for x, y in ls.coords]


def coverage(line, chain):
    """Share of the highway's own road (sampled) within 1.5 km of the driven
    line: does the drive actually cover the highway?"""
    lat0 = math.radians(sum(c[1] for c in line) / len(line))
    kx, ky = 111320 * math.cos(lat0), 110540
    proj = lambda c: (c[0] * kx, c[1] * ky)
    geoms = [LineString([proj(c) for c in line[k:k + 50]]) for k in range(0, len(line) - 1, 49)]
    tree = STRtree(geoms)
    allpts = [c for coords in chain for c in coords]
    sample = allpts[:: max(1, len(allpts) // 400)]
    near = 0
    for c in sample:
        p = Point(proj(c))
        idx = tree.query(p.buffer(1500))
        if any(geoms[i].distance(p) <= 1500 for i in idx):
            near += 1
    return near / len(sample)


def main():
    wanted = sys.argv[1:] or list(STATES)
    done = set()
    if os.path.exists(OUT):
        for l in open(OUT):
            o = json.loads(l)
            if 'line' in o:
                done.add((o['state'], o['slug']))
    out = open(OUT, 'a')
    for state in wanted:
        fips = STATES[state]
        r = shapefile.Reader(os.path.join(HERE, 'tiger', f'tl_2024_{fips}_prisecroads.shp'))
        by = {}
        for sr in r.iterShapeRecords():
            rec = sr.record
            if rec['RTTYP'] not in ('I', 'U'):
                continue
            k = route_key(rec['FULLNAME'])
            if not k:
                continue
            pts = sr.shape.points
            parts = list(sr.shape.parts) + [len(pts)]
            for a, b in zip(parts, parts[1:]):
                by.setdefault(k, []).append([tuple(p) for p in pts[a:b]])
        for k, segs in sorted(by.items()):
            slug, name, kind, num = k
            if (state, slug) in done:
                continue
            pieces = drop_twins(pieces_for(segs))
            own = sum(p['len'] for p in pieces)
            if own < 8000:  # under 5 miles of its own road in the state
                continue
            axis_ns = num % 2 == 1
            chain, gaps = order_pieces(pieces, axis_ns)
            own = sum(hav(a, b) for coords in chain for a, b in zip(coords, coords[1:]))
            pts = waypoints(chain)
            if len(pts) < 2:
                continue
            line, dist, err = drive(pts)
            rec = {'state': state, 'slug': slug, 'name': name, 'kind': kind, 'num': num,
                   'own_m': round(own), 'pieces': len(pieces), 'waypoints': len(pts)}
            if not line:
                rec['error'] = err
            else:
                span = sum(hav(c[0], c[-1]) for c in chain)  # rough
                expected = own + 1.3 * sum(gaps)
                rec.update({'miles': round(dist / 1609.344, 1), 'ratio': round(dist / expected, 2),
                            'gap_m': round(sum(gaps)),
                            'coverage': round(coverage(line, chain), 3), 'line': simplify(line),
                            'direction': 'south to north' if axis_ns else 'west to east'})
            out.write(json.dumps(rec) + '\n')
            out.flush()
            print(state, slug, rec.get('miles'), rec.get('ratio'), rec.get('coverage'), rec.get('error', ''), flush=True)


if __name__ == '__main__':
    main()
