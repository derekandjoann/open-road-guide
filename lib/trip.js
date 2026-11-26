// Chart My Course, browser side: a trip's shape, its share link, its days,
// and its exports (Google Maps, Apple Maps, GPX). No network calls here.
//
// A trip is { from, to, stops, hours }:
//   from / to  { lat, lng, label }
//   stops      [{ kind: 'place' | 'marker', slug, name, latitude, longitude, ... }]
//   hours      driving hours wanted in a day

export const MAX_STOPS = 23; // the router takes 25 points: start, 23 stops, end
export const SAVED_KEY = 'org:trips:v1';

const round4 = (n) => Math.round(n * 1e4) / 1e4;

export function stopKey(s) {
  return `${s.kind === 'marker' ? 'm' : 'p'}:${s.slug}`;
}

export function stopHref(s) {
  return s.kind === 'marker' ? `/marker/${s.slug}` : `/poi/${s.slug}`;
}

// ------------------------------------------------------------ share link
// /plan?f=lng,lat&fl=Label&t=lng,lat&tl=Label&s=p:slug,m:slug&h=6
export function tripToQuery(trip) {
  const q = new URLSearchParams();
  if (trip.from) {
    q.set('f', `${round4(trip.from.lng)},${round4(trip.from.lat)}`);
    if (trip.from.label) q.set('fl', trip.from.label);
  }
  if (trip.to) {
    q.set('t', `${round4(trip.to.lng)},${round4(trip.to.lat)}`);
    if (trip.to.label) q.set('tl', trip.to.label);
  }
  if (trip.stops?.length) q.set('s', trip.stops.map(stopKey).join(','));
  if (trip.hours && trip.hours !== 6) q.set('h', String(trip.hours));
  return q.toString();
}

function parsePoint(raw, label) {
  if (!raw) return null;
  const [lng, lat] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: (label || '').slice(0, 80) || null };
}

// Returns the trip's points plus the stop keys still to look up.
export function queryToTrip(search) {
  const q = new URLSearchParams(search);
  const h = Number(q.get('h'));
  return {
    from: parsePoint(q.get('f'), q.get('fl')),
    to: parsePoint(q.get('t'), q.get('tl')),
    stopKeys: (q.get('s') || '')
      .split(',')
      .filter((k) => /^[pm]:[a-z0-9-]{1,120}$/.test(k))
      .slice(0, MAX_STOPS),
    hours: [3, 4, 5, 6, 7, 8, 10, 12].includes(h) ? h : 6,
  };
}

export function routePoints(trip) {
  if (!trip.from || !trip.to) return null;
  return [
    [trip.from.lng, trip.from.lat],
    ...trip.stops.map((s) => [s.longitude, s.latitude]),
    [trip.to.lng, trip.to.lat],
  ];
}

export function pointsParam(points) {
  return points.map(([lng, lat]) => `${round4(lng)},${round4(lat)}`).join(';');
}

// ------------------------------------------------------------ time at stops
// visit_duration is written by hand ("1-2 hours", "30 minutes", "Half day").
// Take the low end; a place with nothing written gets an hour, a marker ten
// minutes.
export function visitMinutes(stop) {
  if (stop.kind === 'marker') return 10;
  const t = String(stop.visit_duration || '').toLowerCase();
  if (/half/.test(t)) return 180;
  if (/full day|all day|whole day/.test(t)) return 360;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:[-–to ]+\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|h\b|minutes?|mins?)/);
  if (m) {
    const n = Number(m[1]);
    return Math.round(/^h/.test(m[2]) ? n * 60 : n);
  }
  return 60;
}

// Split the drive into days of about `hours` behind the wheel. A day can only
// end at a stop (that's where the visitor would sleep), so with no stops the
// whole drive is one stretch and the page says how many days it would take.
export function splitDays(trip, legs) {
  const limit = (trip.hours || 6) * 60;
  const days = [];
  let cur = { stops: [], driveMin: 0, visitMin: 0, miles: 0 };
  trip.stops.forEach((stop, i) => {
    const leg = legs?.[i] || { minutes: 0, miles: 0 };
    if (cur.driveMin > 0 && cur.driveMin + leg.minutes > limit && cur.stops.length) {
      days.push(cur);
      cur = { stops: [], driveMin: 0, visitMin: 0, miles: 0 };
    }
    cur.driveMin += leg.minutes;
    cur.miles += leg.miles;
    cur.stops.push(stop);
    cur.visitMin += visitMinutes(stop);
  });
  const last = legs?.[trip.stops.length] || { minutes: 0, miles: 0 };
  if (cur.driveMin > 0 && cur.driveMin + last.minutes > limit && cur.stops.length) {
    days.push(cur);
    cur = { stops: [], driveMin: 0, visitMin: 0, miles: 0 };
  }
  cur.driveMin += last.minutes;
  cur.miles += last.miles;
  days.push(cur);
  return days;
}

export function fmtDuration(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

// ------------------------------------------------------------ exports
function seq(trip) {
  return [
    { name: trip.from.label || 'Start', lat: trip.from.lat, lng: trip.from.lng },
    ...trip.stops.map((s) => ({ name: s.name, lat: s.latitude, lng: s.longitude })),
    { name: trip.to.label || 'End', lat: trip.to.lat, lng: trip.to.lng },
  ];
}

const ll = (p) => `${round4(p.lat)},${round4(p.lng)}`;

// Google Maps opens at most 3 stops between start and end in its phone app
// (9 on a computer), so the trip goes out in legs of up to 5 points, each
// leg starting where the last one ended.
export function googleLegs(trip) {
  const pts = seq(trip);
  const legs = [];
  for (let i = 0; i < pts.length - 1; i += 4) {
    const chunk = pts.slice(i, Math.min(i + 5, pts.length));
    const q = new URLSearchParams({ api: '1', origin: ll(chunk[0]), destination: ll(chunk[chunk.length - 1]), travelmode: 'driving' });
    if (chunk.length > 2) q.set('waypoints', chunk.slice(1, -1).map(ll).join('|'));
    legs.push({ from: chunk[0].name, to: chunk[chunk.length - 1].name, url: `https://www.google.com/maps/dir/?${q.toString()}` });
  }
  return legs;
}

// Apple Maps links take one start and one end, so one link per hop.
export function appleHops(trip) {
  const pts = seq(trip);
  const hops = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const q = new URLSearchParams({ saddr: ll(pts[i]), daddr: ll(pts[i + 1]), dirflg: 'd' });
    hops.push({ from: pts[i].name, to: pts[i + 1].name, url: `https://maps.apple.com/?${q.toString()}` });
  }
  return hops;
}

const xml = (s) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// GPX 1.1 with the stops as waypoints, the same stops as a route (for apps
// that navigate stop to stop), and the road line as a track.
export function toGpx(trip, line, title) {
  const pts = seq(trip);
  const name = xml(title || 'Road trip');
  const wpts = pts.map((p) => `  <wpt lat="${p.lat}" lon="${p.lng}"><name>${xml(p.name)}</name></wpt>`).join('\n');
  const rtepts = pts.map((p) => `    <rtept lat="${p.lat}" lon="${p.lng}"><name>${xml(p.name)}</name></rtept>`).join('\n');
  const trkpts = (line || []).map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Open Road Guide (openroadguide.com)" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><link href="https://openroadguide.com/plan"><text>Open Road Guide</text></link></metadata>
${wpts}
  <rte><name>${name}</name>
${rtepts}
  </rte>
  <trk><name>${name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>
`;
}

export function tripTitle(trip) {
  const a = trip.from?.label || 'Start';
  const b = trip.to?.label || 'End';
  return `${a} to ${b}`;
}

// ------------------------------------------------------------ saved on device
// Browser storage can be missing or full (private browsing, some in-app
// browsers), so every read and write is guarded.
export function loadSaved() {
  try {
    const v = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function storeSaved(list) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 30)));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ "Make this trip mine"
// A /plan link for a route or itinerary page. Stops are place rows with slug,
// latitude and longitude, in driving order. With a traced road line the trip
// runs from its first point to its last; without one it runs from the first
// stop to the last.
const cleanLabel = (s) => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export function planHref({ line, startLabel, endLabel, stops }) {
  const pts = (stops || []).filter((s) => s && s.slug && s.latitude != null && s.longitude != null);
  let from;
  let to;
  let middle = pts;
  if (Array.isArray(line) && line.length > 1) {
    const a = line[0];
    const b = line[line.length - 1];
    from = { lng: a[0], lat: a[1], label: cleanLabel(startLabel) || 'Start' };
    to = { lng: b[0], lat: b[1], label: cleanLabel(endLabel) || 'End' };
  } else if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    from = { lng: a.longitude, lat: a.latitude, label: a.name };
    to = { lng: b.longitude, lat: b.latitude, label: b.name };
    middle = pts.slice(1, -1);
  } else {
    return null;
  }
  const seen = new Set();
  const stopsOut = middle
    .filter((s) => (seen.has(s.slug) ? false : seen.add(s.slug)))
    .slice(0, MAX_STOPS)
    .map((s) => ({ kind: 'place', slug: s.slug }));
  return `/plan?${tripToQuery({ from, to, stops: stopsOut, hours: 6 })}`;
}
