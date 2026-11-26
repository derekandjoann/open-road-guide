'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MapView from '../../components/MapView';
import { thumbImage } from '../../lib/images';
import { getCategoryColor } from '../../lib/categoryColors';
import {
  MAX_STOPS,
  stopKey,
  stopHref,
  tripToQuery,
  queryToTrip,
  routePoints,
  pointsParam,
  splitDays,
  fmtDuration,
  visitMinutes,
  googleLegs,
  appleHops,
  toGpx,
  tripTitle,
  loadSaved,
  storeSaved,
} from '../../lib/trip';

const COLORS = { coral: '#FF6B6B', teal: '#4ECDC4', yellow: '#FFD93D', violet: '#9D4EDD', ink: '#1a1a2e', warmGray: '#666' };
const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const SERIF = "'Fraunces', Georgia, serif";

const DETOURS = [
  { v: 0, label: 'Any detour' },
  { v: 15, label: 'Up to 15 min' },
  { v: 30, label: 'Up to 30 min' },
  { v: 60, label: 'Up to 1 hr' },
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function detourLabel(min) {
  if (min <= 2) return 'on the way';
  return `+${fmtDuration(min)} round trip`;
}

// ------------------------------------------------------------ town picker
// Towns come from the guide itself (places' nearest towns and marker towns),
// through the same search the Search page uses, so no outside geocoder.
function TownInput({ label, value, onPick, allowLocate }) {
  const [text, setText] = useState(value?.label || '');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    setText(value?.label || '');
  }, [value?.label, value?.lat, value?.lng]);

  function onChange(e) {
    const v = e.target.value;
    setText(v);
    setNote('');
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/data?kind=site-search&q=${encodeURIComponent(v.trim())}`);
        const d = await res.json();
        setHits((d.towns || []).filter((t) => t.lat != null).slice(0, 8));
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 250);
  }

  function pick(t) {
    const lbl = t.state ? `${t.town}, ${t.state}` : t.town;
    setText(lbl);
    setOpen(false);
    setHits([]);
    onPick({ lat: Number(t.lat), lng: Number(t.lng), label: lbl });
  }

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNote('Location isn’t available in this browser. Type a town instead.');
      return;
    }
    setNote('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNote('');
        onPick({ lat: Number(pos.coords.latitude.toFixed(4)), lng: Number(pos.coords.longitude.toFixed(4)), label: 'My location' });
      },
      () => setNote('Location isn’t allowed. On an iPhone or iPad: Settings → Privacy & Security → Location Services. Or type a town.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 240px' }}>
      <label style={styles.label}>
        {label}
        <input
          type="text"
          value={text}
          onChange={onChange}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Type a town"
          autoComplete="off"
          enterKeyHint="search"
          style={styles.input}
        />
      </label>
      {allowLocate && (
        <button type="button" onClick={locate} style={styles.linkBtn}>
          📍 Use my location
        </button>
      )}
      {note && <div style={styles.small}>{note}</div>}
      {open && text.trim().length >= 2 && (
        <div style={styles.dropdown} role="listbox">
          {hits.length === 0 && <div style={{ ...styles.small, padding: '0.6rem 0.8rem' }}>No town by that name in the guide yet.</div>}
          {hits.map((t) => (
            <button key={`${t.town}-${t.state}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)} style={styles.option}>
              <span style={{ fontWeight: 600 }}>{t.town}</span>
              {t.state && <span style={{ color: COLORS.warmGray }}>, {t.state}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the planner
export default function PlanClient() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [stops, setStops] = useState([]);
  const [hours, setHours] = useState(6);
  const [course, setCourse] = useState(null); // API answer
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const [showPlaces, setShowPlaces] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [category, setCategory] = useState('');
  const [maxDetour, setMaxDetour] = useState(0);
  const [markerLimit, setMarkerLimit] = useState(25);

  const [saved, setSaved] = useState([]);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef(null);

  const trip = useMemo(() => ({ from, to, stops, hours }), [from, to, stops, hours]);

  const say = useCallback((msg) => {
    setFlash(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 3500);
  }, []);

  // Open a shared link, a saved trip or a "Make this trip mine" link.
  const openQuery = useCallback(async (search) => {
    const t = queryToTrip(search);
    setFrom(t.from);
    setTo(t.to);
    setHours(t.hours);
    setStops([]);
    if (t.stopKeys.length) {
      try {
        const res = await fetch(`/api/course?resolve=${encodeURIComponent(t.stopKeys.join(','))}`);
        const d = await res.json();
        setStops((d.stops || []).slice(0, MAX_STOPS));
      } catch {
        setError('Some stops in this link couldn’t be loaded.');
      }
    }
  }, []);

  useEffect(() => {
    setSaved(loadSaved());
    openQuery(window.location.search).finally(() => setReady(true));
  }, [openQuery]);

  // Keep the address bar in step with the trip, so copying it shares the trip.
  useEffect(() => {
    if (!ready) return;
    const q = tripToQuery(trip);
    const url = `${window.location.pathname}${q ? `?${q}` : ''}`;
    window.history.replaceState({}, '', url);
  }, [trip, ready]);

  // Chart the road whenever the start, end or stops change. A short pause
  // lets a quick run of taps go out as one request.
  const pointsKey = useMemo(() => {
    const pts = routePoints(trip);
    return pts ? pointsParam(pts) : '';
  }, [trip]);

  useEffect(() => {
    if (!ready || !pointsKey) return undefined;
    let cancelled = false;
    setStatus('loading');
    setError('');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/course?pts=${encodeURIComponent(pointsKey)}`);
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(d.error || 'The road couldn’t be charted.');
          setStatus('error');
          return;
        }
        setCourse(d);
        setStatus('done');
      } catch {
        if (!cancelled) {
          setError('The road couldn’t be charted. Check your connection and try again.');
          setStatus('error');
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pointsKey, ready]);

  const chosen = useMemo(() => new Set(stops.map(stopKey)), [stops]);

  const places = useMemo(() => (course?.places || []).map((p) => ({ ...p, kind: 'place' })), [course]);
  const markers = useMemo(() => (course?.markers || []).map((m) => ({ ...m, kind: 'marker' })), [course]);

  const categories = useMemo(() => {
    const counts = new Map();
    places.forEach((p) => p.category && counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [places]);

  const fits = (s) => !maxDetour || s.detour_min <= maxDetour;
  const shownPlaces = places.filter((p) => fits(p) && (!category || p.category === category));
  const shownMarkers = markers.filter(fits);

  function addStop(s) {
    if (chosen.has(stopKey(s))) return;
    if (stops.length >= MAX_STOPS) {
      say(`A trip holds up to ${MAX_STOPS} stops. Remove one to add another.`);
      return;
    }
    // Slot the stop in road order among the stops already picked.
    setStops((cur) => {
      const next = [...cur];
      let at = next.length;
      if (s.at_mi != null) {
        const i = next.findIndex((x) => x.at_mi != null && x.at_mi > s.at_mi);
        if (i !== -1) at = i;
      }
      next.splice(at, 0, s);
      return next;
    });
  }

  function removeStop(key) {
    setStops((cur) => cur.filter((s) => stopKey(s) !== key));
  }

  function moveStop(i, d) {
    setStops((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function swapEnds() {
    setFrom(to);
    setTo(from);
    setStops((cur) => [...cur].reverse().map((s) => ({ ...s, at_mi: null })));
  }

  function clearTrip() {
    setFrom(null);
    setTo(null);
    setStops([]);
    setCourse(null);
    setStatus('idle');
  }

  // ---------------------------------------------------------- save / share
  function saveTrip() {
    if (!from || !to) return;
    const q = tripToQuery(trip);
    const entry = { id: q, name: tripTitle(trip), stops: stops.length, savedAt: new Date().toISOString(), q };
    const next = [entry, ...saved.filter((x) => x.id !== q)];
    if (storeSaved(next)) {
      setSaved(next);
      say('Saved on this device.');
    } else {
      say('This browser won’t save trips. Use Share link instead.');
    }
  }

  function deleteSaved(id) {
    const next = saved.filter((x) => x.id !== id);
    storeSaved(next);
    setSaved(next);
  }

  async function shareTrip() {
    const url = `https://openroadguide.com/plan?${tripToQuery(trip)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: tripTitle(trip), url });
        return;
      }
    } catch {
      return; // the visitor closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied.');
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  function downloadGpx() {
    const gpx = toGpx(trip, course?.line, tripTitle(trip));
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tripTitle(trip).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'road-trip'}.gpx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  // ---------------------------------------------------------- map
  const mapPois = useMemo(
    () =>
      [...stops.filter((s) => s.kind === 'place'), ...(showPlaces ? shownPlaces.filter((p) => !chosen.has(stopKey(p))) : [])].map((p) => ({
        id: stopKey(p),
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        category: p.category,
        tagline: p.tagline,
        visit_duration: p.visit_duration,
        href: stopHref(p),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, course, showPlaces, category, maxDetour]
  );
  const mapMarkers = useMemo(
    () =>
      [...stops.filter((s) => s.kind === 'marker'), ...(showMarkers ? shownMarkers.filter((m) => !chosen.has(stopKey(m))) : [])].map((m) => ({
        name: m.name,
        latitude: m.latitude,
        longitude: m.longitude,
        year_erected: m.year_erected,
        href: stopHref(m),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, course, showMarkers, maxDetour]
  );

  const days = course ? splitDays(trip, course.legs) : [];
  const visitTotal = stops.reduce((n, s) => n + visitMinutes(s), 0);
  const haveTrip = Boolean(from && to);

  // ---------------------------------------------------------- render
  return (
    <main style={styles.main}>
      <style>{printCss}</style>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={styles.title}>Chart My Course</h1>
        <p style={styles.tagline}>
          Pick a start and an end. We’ll line up the places and historical markers along the road, in the order you’ll reach them.
        </p>
      </header>

      <section className="no-print" style={styles.panel}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TownInput label="From" value={from} onPick={setFrom} allowLocate />
          <TownInput label="To" value={to} onPick={setTo} />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
          <label style={{ ...styles.small, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            Driving a day
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} style={styles.select}>
              {[3, 4, 5, 6, 7, 8, 10, 12].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </label>
          {haveTrip && (
            <>
              <button type="button" onClick={swapEnds} style={styles.chip}>
                ⇅ Swap
              </button>
              <button type="button" onClick={clearTrip} style={styles.chip}>
                Start over
              </button>
            </>
          )}
        </div>
      </section>

      {!haveTrip && saved.length > 0 && (
        <section className="no-print" style={{ marginBottom: '2rem' }}>
          <h2 style={styles.h2}>Your saved trips</h2>
          <div style={styles.list}>
            {saved.map((s) => (
              <div key={s.id} style={styles.card}>
                <button type="button" onClick={() => openQuery(`?${s.q}`)} style={styles.cardBtn}>
                  <div style={styles.cardTitle}>{s.name}</div>
                  <div style={styles.cardSub}>
                    {s.stops} {s.stops === 1 ? 'stop' : 'stops'} · saved {new Date(s.savedAt).toLocaleDateString()}
                  </div>
                </button>
                <button type="button" onClick={() => deleteSaved(s.id)} style={styles.iconBtn} aria-label={`Delete ${s.name}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!haveTrip && (
        <section style={styles.note}>
          <p style={{ margin: '0 0 0.5rem' }}>
            Every stop comes from the guide: places we’ve written up and historical markers with their stories told. Add the ones you
            want, put them in order, and split the drive into days.
          </p>
          <p style={{ margin: 0 }}>
            Trips save on this device, with no account. Send one to someone with a link, open it in Google Maps or Apple Maps,
            download a GPX file for a GPS, or print it.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            Or browse a highway state by state:{' '}
            <Link href="/along" prefetch={false} style={{ color: COLORS.coral, fontWeight: 600 }}>
              Along the Way
            </Link>
            .
          </p>
        </section>
      )}

      {status === 'loading' && <div style={styles.meta}>Charting the road…</div>}
      {error && <div style={styles.warn}>{error}</div>}
      {flash && <div style={styles.flash}>{flash}</div>}

      {haveTrip && course && (
        <>
          <section style={{ marginBottom: '1.5rem' }}>
            <div style={styles.totals}>
              <div>
                <div style={styles.bigNum}>{course.miles.toLocaleString()} mi</div>
                <div style={styles.small}>on the road</div>
              </div>
              <div>
                <div style={styles.bigNum}>{fmtDuration(course.minutes)}</div>
                <div style={styles.small}>driving</div>
              </div>
              {stops.length > 0 && (
                <div>
                  <div style={styles.bigNum}>{fmtDuration(visitTotal)}</div>
                  <div style={styles.small}>at {stops.length} {stops.length === 1 ? 'stop' : 'stops'}</div>
                </div>
              )}
              <div>
                <div style={styles.bigNum}>{days.length}</div>
                <div style={styles.small}>{days.length === 1 ? 'day' : 'days'}</div>
              </div>
            </div>
            <MapView pois={mapPois} historicalMarkers={mapMarkers} routeLine={course.line} height="440px" />
            <div style={{ ...styles.small, marginTop: '0.4rem' }}>
              Road line: OpenStreetMap contributors, routed by FOSSGIS (OSRM). Drive times are estimates; check road conditions before
              you go.
            </div>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={styles.h2}>Your trip</h2>
            <div style={styles.list}>
              <div style={{ ...styles.endCard }}>
                <span style={styles.dot(COLORS.teal)} />
                <div style={styles.cardTitle}>{from.label || 'Start'}</div>
              </div>
              {days.map((day, di) => (
                <div key={di} style={styles.list}>
                  {days.length > 1 && (
                    <div style={styles.dayHead}>
                      Day {di + 1}: {Math.round(day.miles)} mi, {fmtDuration(day.driveMin)} driving
                      {day.visitMin ? `, ${fmtDuration(day.visitMin)} at stops` : ''}
                      {day.driveMin > hours * 60 + 30 && ' (a long day: add a stop to break it up)'}
                    </div>
                  )}
                  {day.stops.map((s) => {
                    const i = stops.indexOf(s);
                    return (
                      <div key={stopKey(s)} style={{ ...styles.card, borderLeft: `4px solid ${s.kind === 'marker' ? COLORS.violet : getCategoryColor(s.category)}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Link href={stopHref(s)} prefetch={false} style={styles.cardTitleLink}>
                            {s.name}
                          </Link>
                          <div style={styles.cardSub}>
                            {s.kind === 'marker' ? 'Historical marker' : cap(s.category)}
                            {s.kind === 'place' && s.visit_duration ? ` · ${s.visit_duration}` : ''}
                          </div>
                        </div>
                        <div className="no-print" style={{ display: 'flex', gap: '0.25rem' }}>
                          <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} style={styles.iconBtn} aria-label="Move up">
                            ↑
                          </button>
                          <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} style={styles.iconBtn} aria-label="Move down">
                            ↓
                          </button>
                          <button type="button" onClick={() => removeStop(stopKey(s))} style={styles.iconBtn} aria-label={`Remove ${s.name}`}>
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {di < days.length - 1 && day.stops.length > 0 && (
                    <div style={styles.small}>Overnight near {day.stops[day.stops.length - 1].name}</div>
                  )}
                </div>
              ))}
              <div style={styles.endCard}>
                <span style={styles.dot(COLORS.coral)} />
                <div style={styles.cardTitle}>{to.label || 'End'}</div>
              </div>
            </div>
            {stops.length === 0 && course.minutes > hours * 60 && (
              <p style={styles.small}>
                That’s about {Math.ceil(course.minutes / (hours * 60))} days at {hours} hours a day. Add stops below and the drive will
                split into days at them.
              </p>
            )}

            <div className="no-print" style={styles.actions}>
              <button type="button" onClick={saveTrip} style={styles.btn}>
                Save on this device
              </button>
              <button type="button" onClick={shareTrip} style={styles.btnGhost}>
                Share link
              </button>
              <button type="button" onClick={downloadGpx} style={styles.btnGhost}>
                GPX file
              </button>
              <button type="button" onClick={() => window.print()} style={styles.btnGhost}>
                Print
              </button>
            </div>

            <div className="no-print" style={{ marginTop: '1rem' }}>
              <div style={styles.small}>Open in Google Maps{googleLegs(trip).length > 1 ? ', in legs (its phone app takes 3 stops at a time)' : ''}:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                {googleLegs(trip).map((l, i) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={styles.chipLink}>
                    {googleLegs(trip).length > 1 ? `Leg ${i + 1}: ` : ''}
                    {l.from} → {l.to}
                  </a>
                ))}
              </div>
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ ...styles.small, cursor: 'pointer' }}>Open in Apple Maps, one stop at a time</summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                  {appleHops(trip).map((h) => (
                    <a key={h.url} href={h.url} target="_blank" rel="noopener noreferrer" style={styles.chipLink}>
                      {h.from} → {h.to}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          </section>

          <section className="no-print" style={{ marginBottom: '2rem' }}>
            <h2 style={styles.h2}>Along the way</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button type="button" onClick={() => setShowPlaces((v) => !v)} style={styles.toggle(showPlaces)}>
                Places ({places.length})
              </button>
              <button type="button" onClick={() => setShowMarkers((v) => !v)} style={styles.toggle(showMarkers)}>
                Markers ({markers.length})
              </button>
              <select value={maxDetour} onChange={(e) => setMaxDetour(Number(e.target.value))} style={styles.select} aria-label="Longest detour">
                {DETOURS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            {showPlaces && categories.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                <button type="button" onClick={() => setCategory('')} style={styles.toggle(!category)}>
                  All kinds
                </button>
                {categories.map(([c, n]) => (
                  <button key={c} type="button" onClick={() => setCategory(c === category ? '' : c)} style={styles.toggle(c === category)}>
                    {cap(c)} ({n})
                  </button>
                ))}
              </div>
            )}

            {showPlaces && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={styles.h3}>Places</h3>
                {shownPlaces.length === 0 && <div style={styles.small}>No places in the guide along this road with these filters yet.</div>}
                <div style={styles.list}>
                  {shownPlaces.map((p) => {
                    const added = chosen.has(stopKey(p));
                    return (
                      <div key={p.slug} style={{ ...styles.card, borderLeft: `4px solid ${getCategoryColor(p.category)}` }}>
                        {(p.thumbnail_public_id || p.thumbnail_url) && <img src={thumbImage(p, 160)} alt="" loading="lazy" style={styles.thumb} />}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Link href={stopHref(p)} prefetch={false} style={styles.cardTitleLink}>
                            {p.name}
                          </Link>
                          {p.tagline && <div style={styles.cardSub}>{p.tagline}</div>}
                          <div style={styles.where}>
                            Mile {p.at_mi} · {detourLabel(p.detour_min)}
                          </div>
                        </div>
                        <button type="button" onClick={() => (added ? removeStop(stopKey(p)) : addStop(p))} style={styles.addBtn(added)}>
                          {added ? 'Added ✓' : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {showMarkers && (
              <div>
                <h3 style={styles.h3}>Historical markers by the road</h3>
                {shownMarkers.length === 0 && <div style={styles.small}>No told markers within a mile of this road yet.</div>}
                <div style={styles.list}>
                  {shownMarkers.slice(0, markerLimit).map((m) => {
                    const added = chosen.has(stopKey(m));
                    return (
                      <div key={m.slug} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.violet}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Link href={stopHref(m)} prefetch={false} style={styles.cardTitleLink}>
                            {m.name}
                          </Link>
                          <div style={styles.cardSub}>{[m.city, m.state].filter(Boolean).join(', ')}</div>
                          <div style={styles.where}>
                            Mile {m.at_mi} · {detourLabel(m.detour_min)}
                          </div>
                        </div>
                        <button type="button" onClick={() => (added ? removeStop(stopKey(m)) : addStop(m))} style={styles.addBtn(added)}>
                          {added ? 'Added ✓' : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {shownMarkers.length > markerLimit && (
                  <button type="button" onClick={() => setMarkerLimit((n) => n + 50)} style={{ ...styles.btnGhost, marginTop: '0.75rem' }}>
                    Show more markers ({shownMarkers.length - markerLimit} left)
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

const printCss = `
@media print {
  nav, footer, .no-print { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  a { color: inherit !important; text-decoration: none !important; }
}
`;

const styles = {
  main: { maxWidth: '860px', margin: '0 auto', padding: 'clamp(1rem, 4vw, 2.5rem)', fontFamily: FONT, color: COLORS.ink },
  title: { fontFamily: SERIF, fontSize: 'clamp(2rem, 7vw, 3.2rem)', fontWeight: 600, margin: '0 0 0.4rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.1rem', color: '#3a3a4e', margin: 0, lineHeight: 1.45 },
  panel: { background: '#faf8f5', border: '1px solid #eee', borderRadius: '16px', padding: '1rem', marginBottom: '1.5rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.warmGray },
  input: {
    fontFamily: FONT, fontSize: '1rem', padding: '0.7rem 0.9rem', border: '1.5px solid #ddd', borderRadius: '10px',
    background: '#fff', color: COLORS.ink, textTransform: 'none', letterSpacing: 0, fontWeight: 400, width: '100%', boxSizing: 'border-box',
  },
  select: { fontFamily: FONT, fontSize: '0.9rem', padding: '0.45rem 0.6rem', border: '1.5px solid #ddd', borderRadius: '999px', background: '#fff', color: COLORS.ink },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e2e2',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: '0.25rem', overflow: 'hidden',
  },
  option: { display: 'block', width: '100%', textAlign: 'left', padding: '0.65rem 0.8rem', border: 'none', background: '#fff', fontFamily: FONT, fontSize: '0.95rem', cursor: 'pointer', borderBottom: '1px solid #f2f2f2' },
  linkBtn: { background: 'none', border: 'none', padding: '0.4rem 0', color: COLORS.coral, fontWeight: 600, fontFamily: FONT, fontSize: '0.9rem', cursor: 'pointer' },
  btn: { background: COLORS.ink, color: '#fff', border: 'none', borderRadius: '999px', padding: '0.7rem 1.3rem', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', fontFamily: FONT },
  btnGhost: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.6rem 1.2rem', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', fontFamily: FONT, textDecoration: 'none' },
  chip: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.4rem 0.85rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: FONT },
  chipLink: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.45rem 0.9rem', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' },
  toggle: (on) => ({
    background: on ? COLORS.ink : '#fff', color: on ? '#fff' : COLORS.ink, border: `1.5px solid ${on ? COLORS.ink : '#e2e2e2'}`,
    borderRadius: '999px', padding: '0.4rem 0.85rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: FONT,
  }),
  addBtn: (added) => ({
    background: added ? COLORS.teal : '#fff', color: COLORS.ink, border: `1.5px solid ${added ? COLORS.teal : '#ddd'}`,
    borderRadius: '999px', padding: '0.45rem 0.8rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', flex: '0 0 auto',
  }),
  iconBtn: { width: '2.1rem', height: '2.1rem', borderRadius: '50%', border: '1.5px solid #e2e2e2', background: '#fff', cursor: 'pointer', fontSize: '0.95rem', color: COLORS.ink },
  meta: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.warmGray, marginBottom: '1rem' },
  note: { color: '#444', lineHeight: 1.55, marginBottom: '1.5rem' },
  warn: { background: '#fff4f4', border: '1px solid #ffd2d2', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#7a1f1f' },
  flash: { position: 'fixed', left: '50%', bottom: '1.25rem', transform: 'translateX(-50%)', background: COLORS.ink, color: '#fff', padding: '0.7rem 1.2rem', borderRadius: '999px', zIndex: 50, fontWeight: 600, fontSize: '0.9rem' },
  totals: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' },
  bigNum: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.1 },
  small: { fontSize: '0.85rem', color: COLORS.warmGray, lineHeight: 1.45 },
  h2: { fontFamily: SERIF, fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.75rem' },
  h3: { fontFamily: SERIF, fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.6rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: { display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.8rem 1rem', background: '#fff', border: '1px solid #ececec', borderRadius: '12px', color: COLORS.ink },
  cardBtn: { flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, color: COLORS.ink },
  endCard: { display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.4rem 0.25rem' },
  dot: (c) => ({ width: '14px', height: '14px', borderRadius: '50%', background: c, flex: '0 0 auto', border: '2px solid #fff', boxShadow: '0 0 0 1px #ccc' }),
  dayHead: { fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.ink, marginTop: '0.5rem' },
  thumb: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.2 },
  cardTitleLink: { fontFamily: SERIF, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.2, color: COLORS.ink, textDecoration: 'none' },
  cardSub: { fontSize: '0.88rem', color: '#555', lineHeight: 1.4, marginTop: '0.2rem' },
  where: { fontSize: '0.8rem', fontWeight: 600, color: COLORS.warmGray, marginTop: '0.3rem' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.25rem' },
};
