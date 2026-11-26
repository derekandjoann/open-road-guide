"""Version 3 of the highway lines: route from end to end, then add waypoints
only where the route misses the highway's own road (Census TIGER), until at
least 97% of that road lies within 1.5 km of the route. The line never
follows the pieces in order, so it can't run down one side of a divided
highway and back up the other.

Output: lines3.jsonl.  Usage: python3 build_v3.py [State ...]
"""
import json, math, os, sys
import shapefile
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
import build_lines as B

OUT = os.path.join(B.HERE, 'lines3.jsonl')


def proj_fn(lat_deg):
    kx, ky = 111320 * math.cos(math.radians(lat_deg)), 110540
    return lambda c: (c[0] * kx, c[1] * ky)


def local_bearing(coords, k):
    a = coords[max(0, k - 3)]
    b = coords[min(len(coords) - 1, k + 3)]
    return B.bearing(a, b) if a != b else None


def build(state, slug, name, kind, num, segs):
    segs = [sg for sg in segs if len(sg) > 1]
    own = sum(B.hav(a, b) for sg in segs for a, b in zip(sg, sg[1:]))
    if own < 8000:
        return None
    axis_ns = num % 2 == 1
    # Keep the road that hangs together: put every point on a half-degree
    # grid, join cells up to two cells apart (about 100 to 200 km), and keep
    # the group with the most road. Old alignments far from today's highway
    # fall away. Both sources (TIGER and the National Highway System) are used
    # as they are, so a stretch one of them names differently is not lost.
    cell = lambda c: (int(math.floor(c[0] * 2)), int(math.floor(c[1] * 2)))
    cells = {}
    for i, sg in enumerate(segs):
        for c in sg:
            cells.setdefault(cell(c), set()).add(i)
    parent = {k: k for k in cells}
    def find(k):
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k
    for (x, y) in cells:
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                n = (x + dx, y + dy)
                if n in cells and find(n) != find((x, y)):
                    parent[find(n)] = find((x, y))
    groups = {}
    for k, idx in cells.items():
        groups.setdefault(find(k), set()).update(idx)
    seglen = lambda sg: sum(B.hav(a, b) for a, b in zip(sg, sg[1:]))
    keep = max(groups.values(), key=lambda g: sum(seglen(segs[i]) for i in g))
    pieces = [{'coords': segs[i]} for i in sorted(keep)]
    # The highway's ends: its farthest points apart along its direction of
    # travel (south to north for odd numbers, west to east for even).
    allc = [c for p in pieces for c in p['coords']]
    if axis_ns:
        A, Bend = min(allc, key=lambda c: c[1]), max(allc, key=lambda c: c[1])
    else:
        A, Bend = min(allc, key=lambda c: c[0]), max(allc, key=lambda c: c[0])
    # Orient each piece from A toward B for the bearings below.
    lat_r0 = math.radians((A[1] + Bend[1]) / 2)
    ux, uy = (Bend[0] - A[0]) * math.cos(lat_r0), Bend[1] - A[1]
    tt = lambda c: (c[0] - A[0]) * math.cos(lat_r0) * ux + (c[1] - A[1]) * uy
    chain = []
    for p in pieces:
        co = p['coords']
        chain.append(co[::-1] if tt(co[0]) > tt(co[-1]) else co)
    def end_bearing(pt):
        for co in chain:
            for k, c in enumerate(co):
                if c == pt:
                    return local_bearing(co, k)
        return None
    # sample points of the highway's own road: (coord, bearing)
    samples = []
    for coords in chain:
        acc = 1e9
        for k in range(len(coords)):
            if k:
                acc += B.hav(coords[k - 1], coords[k])
            if acc >= 2000:
                br = local_bearing(coords, k)
                if br is not None:
                    samples.append((coords[k], br))
                acc = 0
    if len(samples) < 2:
        return None
    lat0 = (A[1] + Bend[1]) / 2
    P = proj_fn(lat0)
    lat_r = math.radians(lat0)
    vx, vy = (Bend[0] - A[0]) * math.cos(lat_r), Bend[1] - A[1]
    norm = math.hypot(vx, vy) or 1.0
    t = lambda c: ((c[0] - A[0]) * math.cos(lat_r) * vx + (c[1] - A[1]) * vy) / norm
    wps = [(A, end_bearing(A)), (Bend, end_bearing(Bend))]
    best = None
    for it in range(10):
        line, dist, err = B.drive(sorted(wps, key=lambda w: t(w[0])))
        if not line:
            return {'state': state, 'slug': slug, 'name': name, 'error': err}
        geoms = [LineString([P(c) for c in line[i:i + 50]]) for i in range(0, len(line) - 1, 49)]
        tree = STRtree(geoms)
        miss = []
        for c, br in samples:
            p = Point(P(c))
            idx = tree.query(p.buffer(1500))
            if not any(geoms[i].distance(p) <= 1500 for i in idx):
                d = min(g.distance(p) for g in geoms)
                miss.append((d, c, br))
        cov = 1 - len(miss) / len(samples)
        best = (line, dist, cov, len(wps))
        if cov >= 0.97 or len(wps) >= 24:
            break
        miss.sort(key=lambda m: -m[0])
        _, c, br = miss[0]
        wps.append((c, br))
    line, dist, cov, n = best
    # backtrack test: no point of the line much farther from either end than the ends are apart
    se = B.hav(line[0], line[-1])
    far = max(max(B.hav(line[0], c), B.hav(line[-1], c)) for c in line[:: max(1, len(line) // 300)])
    return {'state': state, 'slug': slug, 'name': name, 'kind': kind, 'num': num,
            'miles': round(dist / 1609.344, 1), 'coverage': round(cov, 3), 'waypoints': n,
            'backtrack': far > se * 1.1 + 15000,
            'direction': 'south to north' if axis_ns else 'west to east',
            'line': B.simplify(line)}


def main():
    wanted = sys.argv[1:] or list(B.STATES)
    done = set()
    if os.path.exists(OUT):
        for l in open(OUT):
            o = json.loads(l)
            if 'line' in o:
                done.add((o['state'], o['slug']))
    out = open(OUT, 'a')
    for state in wanted:
        r = shapefile.Reader(os.path.join(B.HERE, 'tiger', f'tl_2024_{B.STATES[state]}_prisecroads.shp'))
        by = {}
        for sr in r.iterShapeRecords():
            rec = sr.record
            if rec['RTTYP'] not in ('I', 'U'):
                continue
            k = B.route_key(rec['FULLNAME'])
            if not k:
                continue
            pts = sr.shape.points
            parts = list(sr.shape.parts) + [len(pts)]
            for a, b in zip(parts, parts[1:]):
                by.setdefault(k, []).append([tuple(p) for p in pts[a:b]])
        # National Highway System lines fill what TIGER files under local
        # freeway names (TIGER's I-10 in Texas stops at Houston).
        for st, sn, coords in json.load(open(os.path.join(B.HERE, 'nhs', f'{B.STATES[state]}.json'))):
            k = B.route_key(('I-' if st == 'I' else 'US Hwy ') + sn)
            if k and len(coords) > 1:
                by.setdefault(k, []).append([tuple(c) for c in coords])
        for (slug, name, kind, num), segs in sorted(by.items()):
            if (state, slug) in done or slug in ('us-66',):
                continue
            rec = build(state, slug, name, kind, num, segs)
            if rec is None:
                continue
            out.write(json.dumps(rec) + '\n')
            out.flush()
            print(state, slug, rec.get('miles'), rec.get('coverage'), rec.get('waypoints'), 'BACKTRACK' if rec.get('backtrack') else '', rec.get('error', ''), flush=True)


if __name__ == '__main__':
    main()
