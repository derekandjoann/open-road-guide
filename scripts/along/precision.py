"""For held segments: share of the driven line within 1.5 km of the highway's
own road (precision) next to the stored coverage (recall)."""
import json, os, math
import shapefile
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
import build_lines as B

def own_segs(state, slug):
    r = shapefile.Reader(os.path.join(B.HERE, 'tiger', f'tl_2024_{B.STATES[state]}_prisecroads.shp'))
    segs = []
    for sr in r.iterShapeRecords():
        rec = sr.record
        if rec['RTTYP'] in ('I', 'U'):
            k = B.route_key(rec['FULLNAME'])
            if k and k[0] == slug:
                pts = sr.shape.points; parts = list(sr.shape.parts) + [len(pts)]
                for a, b in zip(parts, parts[1:]):
                    segs.append([tuple(p) for p in pts[a:b]])
    for t, n, co in json.load(open(os.path.join(B.HERE, 'nhs', f'{B.STATES[state]}.json'))):
        k = B.route_key(('I-' if t == 'I' else 'US Hwy ') + n)
        if k and k[0] == slug and len(co) > 1:
            segs.append([tuple(c) for c in co])
    return segs

def precision(line, segs):
    lat0 = sum(c[1] for c in line) / len(line)
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
    P = lambda c: (c[0] * kx, c[1] * ky)
    geoms = [LineString([P(c) for c in s]) for s in segs if len(s) > 1]
    tree = STRtree(geoms)
    sample = line[:: max(1, len(line) // 400)]
    near = 0
    for c in sample:
        p = Point(P(c))
        if any(geoms[i].distance(p) <= 1500 for i in tree.query(p.buffer(1500))):
            near += 1
    return near / len(sample)

if __name__ == '__main__':
    rows = [json.loads(l) for l in open('lines3.jsonl')]
    held = [o for o in rows if 'line' not in o or o['coverage'] < 0.9 or o['backtrack'] or o['miles'] < 5]
    for o in held:
        if 'line' not in o:
            print(o['state'], o['slug'], 'ERROR'); continue
        pr = precision(o['line'], own_segs(o['state'], o['slug']))
        print(f"{o['state']}\t{o['slug']}\t{o['miles']}\tcov {o['coverage']}\tprec {pr:.3f}\twp {o['waypoints']}")
