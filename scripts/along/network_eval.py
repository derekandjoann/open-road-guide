"""Precision against the whole interstate + US highway network of the state
(TIGER and NHS), for lines that failed the own-road precision test."""
import json, math, os, sys
import shapefile
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
import build_lines as B

_net = {}
def network(state):
    if state in _net: return _net[state]
    segs = []
    r = shapefile.Reader(os.path.join(B.HERE, 'tiger', f'tl_2024_{B.STATES[state]}_prisecroads.shp'))
    for sr in r.iterShapeRecords():
        if sr.record['RTTYP'] in ('I', 'U'):
            pts = sr.shape.points; parts = list(sr.shape.parts) + [len(pts)]
            for a, b in zip(parts, parts[1:]):
                if b - a > 1: segs.append(pts[a:b])
    for t, n, co in json.load(open(os.path.join(B.HERE, 'nhs', f'{B.STATES[state]}.json'))):
        if len(co) > 1: segs.append(co)
    lat0 = sum(s[0][1] for s in segs) / len(segs)
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
    P = lambda c: (c[0] * kx, c[1] * ky)
    geoms = [LineString([P(c) for c in s]) for s in segs]
    _net[state] = (STRtree(geoms), geoms, P)
    return _net[state]

def net_precision(state, line, tol=300):
    tree, geoms, P = network(state)
    sample = line[:: max(1, len(line) // 400)]
    near = 0
    for c in sample:
        p = Point(P(c))
        if any(geoms[i].distance(p) <= tol for i in tree.query(p.buffer(tol))):
            near += 1
    return near / len(sample)
