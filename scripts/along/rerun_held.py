import json, os, sys
import build_v3 as V, build_lines as B
from precision import own_segs
rows = [json.loads(l) for l in open('lines3.jsonl')]
held = [o for o in rows if 'line' in o and (o['coverage'] < 0.9 or o['backtrack']) and o['miles'] >= 5]
out = open('lines3.jsonl', 'a')
for o in held:
    segs = own_segs(o['state'], o['slug'])
    rec = V.build(o['state'], o['slug'], o['name'], o['kind'], o['num'], segs, max_iter=22)
    if rec and 'line' in rec:
        out.write(json.dumps(rec) + '\n'); out.flush()
    print(o['state'], o['slug'], o['coverage'], '->', rec and rec.get('coverage'), rec and rec.get('waypoints'), rec and rec.get('miles'), flush=True)
