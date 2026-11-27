'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { queryToTrip, routePoints, pointsParam, tripToQuery, tripTitle, stopKey } from '../../lib/trip';

// Drive Mode: the road ahead. Opened from a Chart My Course trip
// (/drive?<same query as /plan>). Follows the phone's location along the
// trip's road line and counts down the miles to the next places and
// historical markers. Dark, large type for the car. Optional spoken
// announcements about two miles out.

const C = { bg: '#12121f', card: '#1f1f33', ink: '#fff', dim: 'rgba(255,255,255,0.62)', coral: '#FF6B6B', teal: '#4ECDC4', yellow: '#FFD93D', violet: '#B983FF' };
const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const SERIF = "'Fraunces', Georgia, serif";
const M_PER_MI = 1609.344;
const OFF_ROUTE_M = 2500;
const ANNOUNCE_MI = 2;

// Local flat projection around the trip, good to a few meters over a state.
function projector(line) {
  const lat0 = (line.reduce((s, c) => s + c[1], 0) / line.length) * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  return ([lng, lat]) => [lng * kx, lat * ky];
}

// Cumulative meters along the line at each vertex.
function measure(pline) {
  const cum = [0];
  for (let i = 1; i < pline.length; i += 1) {
    const [ax, ay] = pline[i - 1];
    const [bx, by] = pline[i];
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return cum;
}

// Where a point falls on the line: meters along it, and meters off it.
function locate(pline, cum, p) {
  let best = { along: 0, off: Infinity };
  for (let i = 1; i < pline.length; i += 1) {
    const [ax, ay] = pline[i - 1];
    const [bx, by] = pline[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const off = Math.hypot(p[0] - qx, p[1] - qy);
    if (off < best.off) best = { along: cum[i - 1] + t * Math.sqrt(len2), off };
  }
  return best;
}

const fmtMi = (m) => {
  const mi = m / M_PER_MI;
  if (mi < 0.1) return 'now';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
};

function say(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export default function DriveClient() {
  const [trip, setTrip] = useState(null);
  const [course, setCourse] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState('');
  const [pos, setPos] = useState(null); // [lng, lat]
  const [gpsNote, setGpsNote] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const announced = useRef(new Set());
  const wakeLock = useRef(null);

  // Load the trip from the address bar, then its road and stops.
  useEffect(() => {
    const t = queryToTrip(window.location.search);
    if (!t.from || !t.to) {
      setError('Open Drive Mode from a trip in Chart My Course.');
      return;
    }
    setTrip(t);
    (async () => {
      try {
        let stops = [];
        if (t.stopKeys.length) {
          const r = await fetch(`/api/course?resolve=${encodeURIComponent(t.stopKeys.join(','))}`);
          stops = (await r.json()).stops || [];
        }
        setChosen(stops);
        const pts = routePoints({ ...t, stops });
        const res = await fetch(`/api/course?pts=${encodeURIComponent(pointsParam(pts))}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'route');
        setCourse(d);
      } catch {
        setError('The road for this trip couldn’t be loaded. Check your signal and reload.');
      }
    })();
  }, []);

  // Follow the phone's location.
  useEffect(() => {
    if (!course) return undefined;
    if (!navigator.geolocation) {
      setGpsNote('This browser can’t share your location.');
      return undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos([p.coords.longitude, p.coords.latitude]);
        setGpsNote('');
      },
      () => setGpsNote('Location is off. Allow location for this site to follow the road.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [course]);

  // Keep the screen on while driving, where the browser allows it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await navigator.wakeLock.request('screen');
          if (cancelled) lock.release();
          else wakeLock.current = lock;
        }
      } catch {
        /* not allowed; fine */
      }
    })();
    return () => {
      cancelled = true;
      try {
        wakeLock.current?.release();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Every stop on the road, measured along the line once.
  const geo = useMemo(() => {
    if (!course?.line?.length) return null;
    const P = projector(course.line);
    const pline = course.line.map(P);
    const cum = measure(pline);
    const chosenKeys = new Set(chosen.map(stopKey));
    const items = [
      ...course.places.map((p) => ({ ...p, kind: 'place' })),
      ...course.markers.map((m) => ({ ...m, kind: 'marker' })),
    ].map((s) => {
      const loc = locate(pline, cum, P([s.longitude, s.latitude]));
      return { ...s, along: loc.along, offM: loc.off, mine: chosenKeys.has(stopKey(s)) };
    });
    items.sort((a, b) => a.along - b.along);
    return { P, pline, cum, total: cum[cum.length - 1], items };
  }, [course, chosen]);

  const here = useMemo(() => (geo && pos ? locate(geo.pline, geo.cum, geo.P(pos)) : null), [geo, pos]);
  const offRoute = here && here.off > OFF_ROUTE_M;
  const at = here ? here.along : 0;

  const ahead = useMemo(() => {
    if (!geo) return [];
    return geo.items
      .filter((s) => s.along >= at - 150 && (showMarkers || s.kind === 'place' || s.mine))
      .map((s) => ({ ...s, toGo: Math.max(0, s.along - at) }));
  }, [geo, at, showMarkers]);

  // Spoken heads-up about two miles out, once per stop.
  useEffect(() => {
    if (!announce || offRoute) return;
    for (const s of ahead.slice(0, 3)) {
      const mi = s.toGo / M_PER_MI;
      const key = stopKey(s);
      if (mi <= ANNOUNCE_MI && mi > 0.2 && !announced.current.has(key)) {
        announced.current.add(key);
        const what = s.kind === 'marker' ? 'historical marker' : 'stop';
        say(`In ${mi < 1 ? 'under a mile' : `${Math.round(mi)} miles`}, ${what}: ${s.name}.`);
        break;
      }
    }
  }, [ahead, announce, offRoute]);

  const next = ahead[0];
  const then = ahead.slice(1, 7);
  const toGoTotal = geo ? Math.max(0, geo.total - at) : 0;
  const etaMin = course && geo ? (course.minutes * toGoTotal) / geo.total : 0;
  const arrive = etaMin ? new Date(Date.now() + etaMin * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

  if (error) {
    return (
      <main style={s.main}>
        <h1 style={s.h1}>Drive Mode</h1>
        <p style={s.dim}>{error}</p>
        <Link href="/plan" style={s.link}>Chart My Course →</Link>
      </main>
    );
  }

  return (
    <main style={s.main}>
      <div style={s.top}>
        <div style={{ minWidth: 0 }}>
          <div style={s.eyebrow}>Drive Mode</div>
          <div style={s.title}>{trip ? tripTitle(trip) : 'Loading…'}</div>
        </div>
        <Link href={trip ? `/plan?${tripToQuery({ ...trip, stops: chosen })}` : '/plan'} style={s.exit}>
          Exit
        </Link>
      </div>

      {!course && <p style={s.dim}>Loading the road…</p>}
      {gpsNote && <div style={s.note}>{gpsNote}</div>}
      {offRoute && <div style={s.note}>You’re {fmtMi(here.off)} off this trip’s road. The countdown resumes when you rejoin it.</div>}

      {course && next && (
        <section style={{ ...s.nextCard, borderColor: next.kind === 'marker' ? C.violet : C.coral }}>
          <div style={s.label}>{next.mine ? 'Your next stop' : next.kind === 'marker' ? 'Historical marker ahead' : 'Coming up'}</div>
          <div style={s.bigMi}>{pos ? fmtMi(next.toGo) : `mile ${Math.round(next.along / M_PER_MI)}`}</div>
          <div style={s.nextName}>{next.name}</div>
          <div style={s.dim}>
            {next.offM < 400 ? 'Right by the road' : `${(next.offM / M_PER_MI).toFixed(1)} mi off the road`}
            {next.kind === 'place' && next.visit_duration ? ` · ${next.visit_duration}` : ''}
          </div>
          <div style={s.row}>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${next.latitude},${next.longitude}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              style={s.btn}
            >
              Directions
            </a>
            <button
              type="button"
              style={s.btnGhost}
              onClick={() => say(`${next.name}. ${next.teaser || next.tagline || ''}`)}
            >
              ▶ Hear about it
            </button>
          </div>
        </section>
      )}

      {course && !next && pos && <div style={s.note}>No more stops in the guide between here and the end of the trip.</div>}

      {then.length > 0 && (
        <section style={{ marginTop: '1.2rem' }}>
          <div style={s.label}>Then</div>
          <div style={s.list}>
            {then.map((t) => (
              <Link key={stopKey(t)} href={t.kind === 'marker' ? `/marker/${t.slug}` : `/poi/${t.slug}`} style={s.item}>
                <span style={{ ...s.dot, background: t.mine ? C.yellow : t.kind === 'marker' ? C.violet : C.coral }} />
                <span style={s.itemName}>{t.name}</span>
                <span style={s.itemMi}>{pos ? fmtMi(t.toGo) : `mi ${Math.round(t.along / M_PER_MI)}`}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {course && (
        <section style={s.footer}>
          <div>
            <div style={s.footNum}>{Math.round(toGoTotal / M_PER_MI)} mi</div>
            <div style={s.footLbl}>to {trip?.to?.label || 'the end'}</div>
          </div>
          {arrive && pos && (
            <div>
              <div style={s.footNum}>{arrive}</div>
              <div style={s.footLbl}>arrive, driving only</div>
            </div>
          )}
        </section>
      )}

      {course && (
        <div style={{ ...s.row, marginTop: '1rem' }}>
          <button type="button" onClick={() => setAnnounce((v) => !v)} style={announce ? s.toggleOn : s.toggle}>
            {announce ? '🔊 Announcing stops' : '🔈 Announce stops'}
          </button>
          <button type="button" onClick={() => setShowMarkers((v) => !v)} style={showMarkers ? s.toggleOn : s.toggle}>
            {showMarkers ? 'Markers on' : 'Markers off'}
          </button>
        </div>
      )}
      <p style={{ ...s.dim, fontSize: '0.8rem', marginTop: '1.5rem' }}>
        Keep your eyes on the road: set up before you drive, and let a passenger tap. Miles are along this trip’s road, not exits or mileposts.
      </p>
    </main>
  );
}

const s = {
  main: { minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: FONT, padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '760px', margin: '0 auto' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' },
  eyebrow: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.teal },
  title: { fontFamily: SERIF, fontSize: '1.15rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  exit: { color: C.ink, border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '999px', padding: '0.45rem 1rem', textDecoration: 'none', fontWeight: 600, flex: '0 0 auto' },
  h1: { fontFamily: SERIF, fontSize: '2rem' },
  dim: { color: C.dim, fontSize: '0.95rem', lineHeight: 1.45 },
  link: { color: C.coral, fontWeight: 600 },
  note: { background: '#2a2a40', borderRadius: '12px', padding: '0.75rem 1rem', margin: '0.75rem 0', color: C.ink },
  nextCard: { background: C.card, borderRadius: '20px', padding: '1.4rem 1.3rem', borderLeft: '6px solid', marginTop: '0.5rem' },
  label: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, marginBottom: '0.4rem' },
  bigMi: { fontFamily: SERIF, fontSize: 'clamp(3.2rem, 16vw, 5rem)', fontWeight: 600, lineHeight: 1, color: C.yellow },
  nextName: { fontFamily: SERIF, fontSize: 'clamp(1.5rem, 6vw, 2rem)', fontWeight: 600, lineHeight: 1.15, margin: '0.5rem 0 0.35rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1rem' },
  btn: { background: C.coral, color: '#1a1a2e', borderRadius: '999px', padding: '0.75rem 1.3rem', fontWeight: 700, textDecoration: 'none', fontSize: '1rem' },
  btnGhost: { background: 'transparent', color: C.ink, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: '999px', padding: '0.7rem 1.2rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', fontFamily: FONT },
  list: { display: 'flex', flexDirection: 'column', gap: '0.45rem' },
  item: { display: 'flex', alignItems: 'center', gap: '0.75rem', background: C.card, borderRadius: '12px', padding: '0.8rem 1rem', color: C.ink, textDecoration: 'none' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flex: '0 0 auto' },
  itemName: { flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemMi: { fontFamily: SERIF, fontWeight: 600, fontSize: '1.15rem', color: C.yellow, flex: '0 0 auto' },
  footer: { display: 'flex', gap: '2rem', marginTop: '1.4rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.12)' },
  footNum: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600 },
  footLbl: { fontSize: '0.8rem', color: C.dim },
  toggle: { background: 'transparent', color: C.ink, border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '999px', padding: '0.55rem 1rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT },
  toggleOn: { background: C.teal, color: '#12121f', border: '1.5px solid ' + C.teal, borderRadius: '999px', padding: '0.55rem 1rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT },
};
