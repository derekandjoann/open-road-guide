// Chart My Course, server side: the road line between a visitor's points and
// the places and told markers along it.
//
// Road lines come from the OpenStreetMap routing server run by FOSSGIS
// (routing.openstreetmap.de, the OSRM engine). Its rules: no more than one
// request a second, a real user agent, credit to OpenStreetMap on the page,
// no heavy use. The API route caches each answer on Netlify's CDN for a week,
// so a trip that has been charted once never asks the server again. To move
// to a paid service later, only routeLine() below changes.

import { supabase } from './supabase';

const ROUTER = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
const USER_AGENT = 'OpenRoadGuide/1.0 (+https://openroadguide.com/plan)';

export const MAX_POINTS = 25; // start, up to 23 stops, end
const M_PER_MI = 1609.344;

// "lng,lat;lng,lat;..." -> [[lng, lat], ...] rounded to 4 places (about 10 m),
// so two visitors charting the same trip share one cached answer.
export function parsePoints(raw) {
  if (typeof raw !== 'string' || raw.length > 1200) return null;
  const pts = raw.split(';').map((pair) => pair.split(',').map(Number));
  if (pts.length < 2 || pts.length > MAX_POINTS) return null;
  for (const p of pts) {
    if (p.length !== 2 || !p.every(Number.isFinite)) return null;
    if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) return null;
  }
  return pts.map(([lng, lat]) => [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]);
}

// Douglas-Peucker on [lng, lat] pairs. A tolerance of 0.0002 degrees (about
// 20 m) keeps every bend a marker could stand on and cuts a cross-country line
// from tens of thousands of points to a few thousand.
export function simplify(points, tol = 0.0002) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}

// The driving line through the points, with total and per-leg miles and minutes.
export async function routeLine(points) {
  const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const res = await fetch(`${ROUTER}${coords}?overview=full&geometries=geojson&steps=false`, {
    headers: { 'User-Agent': USER_AGENT, Referer: 'https://openroadguide.com/plan' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`router ${res.status}`);
  const body = await res.json();
  if (body.code !== 'Ok' || !body.routes?.length) {
    const err = new Error(body.code || 'no route');
    err.noRoute = true;
    throw err;
  }
  const r = body.routes[0];
  return {
    miles: r.distance / M_PER_MI,
    minutes: r.duration / 60,
    legs: r.legs.map((l) => ({ miles: l.distance / M_PER_MI, minutes: l.duration / 60 })),
    line: simplify(r.geometry.coordinates),
  };
}

// Minutes a stop adds to the day: there and back off the line, roads about
// 1.3 times the straight distance, at about 40 mph once off the main road.
export function detourMinutes(offMeters) {
  const offMi = offMeters / M_PER_MI;
  return Math.round(((offMi * 2 * 1.3) / 40) * 60);
}

export async function stopsAlong(line, totalMiles) {
  // Short drives look a little wider for places; very long ones stay tight so
  // the list stays about things worth leaving the road for.
  const placesBuffer = totalMiles < 60 ? 32000 : totalMiles > 900 ? 16000 : 24000;
  const { data, error } = await supabase.rpc('stops_along', {
    line,
    places_buffer_m: placesBuffer,
    markers_buffer_m: 1200,
    max_places: 150,
    max_markers: 400,
  });
  if (error) throw new Error(error.message);
  const shape = (row) => ({
    ...row,
    at_mi: Math.round(row.pos * totalMiles),
    off_mi: Math.round((row.off_m / M_PER_MI) * 10) / 10,
    detour_min: detourMinutes(row.off_m),
    pos: undefined,
    off_m: undefined,
  });
  return {
    places: (data?.places || []).map(shape),
    markers: (data?.markers || []).map(shape),
  };
}

// Stops named in a shared link ("p:slug" for places, "m:slug" for markers)
// with what the planner needs to show and route them.
export async function resolveStops(raw) {
  const items = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[pm]:[a-z0-9-]{1,120}$/.test(s))
    .slice(0, MAX_POINTS);
  const poiSlugs = items.filter((s) => s.startsWith('p:')).map((s) => s.slice(2));
  const markerSlugs = items.filter((s) => s.startsWith('m:')).map((s) => s.slice(2));
  const [pr, mr] = await Promise.all([
    poiSlugs.length
      ? supabase
          .from('pois')
          .select('slug,name,tagline,category,state,nearest_city,visit_duration,thumbnail_url,thumbnail_public_id,latitude,longitude')
          .eq('published', true)
          .in('slug', poiSlugs)
      : { data: [] },
    markerSlugs.length
      ? supabase
          .from('markers')
          .select('slug,name,city,state,year_erected,latitude,longitude')
          .eq('has_page', true)
          .in('slug', markerSlugs)
      : { data: [] },
  ]);
  const bySlug = new Map();
  (pr.data || []).forEach((p) => bySlug.set(`p:${p.slug}`, { ...p, kind: 'place' }));
  (mr.data || []).forEach((m) => bySlug.set(`m:${m.slug}`, { ...m, kind: 'marker' }));
  return items.map((k) => bySlug.get(k)).filter((s) => s && s.latitude != null);
}
