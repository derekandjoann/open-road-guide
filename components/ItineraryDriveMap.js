'use client';

// ItineraryDriveMap — an animated "play the drive" map for itinerary pages.
//
// Given the itinerary's route line (routes.path_geojson, a bare [lng, lat]
// array — same shape MapView consumes) plus the trip's day-by-day stops,
// this renders the route on the site's standard OSM/MapLibre basemap and
// lets the reader press play: a marker drives the route, the line fills in
// behind it colored by day, and a panel tracks the current stop with a link
// to its POI page.
//
// Everything is computed client-side from data the page already owns:
// - Stops are projected onto the route line (plain haversine + local
//   equirectangular segment projection — no geo library needed).
// - Day boundaries are the furthest-along on-route stop of each day, so
//   reordering an itinerary in Supabase re-derives the map with no edits.
// - Stops that sit well off the corridor (a spur like the Grand Canyon rim,
//   ~55 mi off Route 66) are drawn at their true position with a dashed
//   connector to the road — never faked onto the line.
//
// No new dependencies: maplibre-gl is already in the bundle for MapView.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  paper: '#FFF8F0',
  warmGray: '#666',
};

// One brand color per day, cycling if a trip ever runs past four days.
const DAY_COLORS = [COLORS.coral, COLORS.teal, COLORS.violet, '#E6B800'];
// (Day 4 uses a darkened yellow — the brand yellow itself is too light to
// read as a line over the raster basemap.)

const dayColor = (dayNumber) => DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];

// A stop more than ~8 km (5 mi) off the line is a spur, not a drive-by.
const SPUR_KM = 8;
// Full playback duration.
const PLAY_MS = 24000;

// ---------- geometry (plain JS, no deps) ----------

const EARTH_KM = 6371;

function haversineKm(a, b) {
  // a, b are [lng, lat]
  const toRad = (d) => (d * Math.PI) / 180;
  const [lng1, lat1] = a.map(toRad);
  const [lng2, lat2] = b.map(toRad);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

// Cumulative km at each vertex of the line.
function cumulativeKm(line) {
  const cum = [0];
  for (let i = 0; i < line.length - 1; i++) {
    cum.push(cum[i] + haversineKm(line[i], line[i + 1]));
  }
  return cum;
}

// Project a point onto the polyline. Returns the along-line distance (km),
// the perpendicular offset (km), and the projected point itself. Each
// segment is treated in a local flat frame around the point — accurate to
// well under 1% at route scale, which is all a visual scrubber needs.
function projectOntoLine(line, cum, lng, lat) {
  const kLng = Math.cos((lat * Math.PI) / 180) * 111.32; // km per degree lng
  const kLat = 110.57; // km per degree lat
  let best = { offKm: Infinity, alongKm: 0, point: line[0] };
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - lng) * kLng;
    const ay = (line[i][1] - lat) * kLat;
    const bx = (line[i + 1][0] - lng) * kLng;
    const by = (line[i + 1][1] - lat) * kLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const off = Math.sqrt(px * px + py * py);
    if (off < best.offKm) {
      best = {
        offKm: off,
        alongKm: cum[i] + t * (cum[i + 1] - cum[i]),
        point: [
          line[i][0] + t * (line[i + 1][0] - line[i][0]),
          line[i][1] + t * (line[i + 1][1] - line[i][1]),
        ],
      };
    }
  }
  return best;
}

// The [lng, lat] position at fraction t (0..1) of the line's length.
function positionAt(line, cum, t) {
  const target = Math.max(0, Math.min(1, t)) * cum[cum.length - 1];
  for (let i = 0; i < line.length - 1; i++) {
    if (target <= cum[i + 1] || i === line.length - 2) {
      const seg = cum[i + 1] - cum[i];
      const f = seg === 0 ? 0 : Math.min(1, Math.max(0, (target - cum[i]) / seg));
      return [
        line[i][0] + f * (line[i + 1][0] - line[i][0]),
        line[i][1] + f * (line[i + 1][1] - line[i][1]),
      ];
    }
  }
  return line[line.length - 1];
}

// The line's coordinates up to fraction t, ending exactly at the
// interpolated tip — used to redraw the traveled portion each frame.
// Sliced per day band so each traveled stretch keeps its day's color.
function slicedByDay(line, cum, bands, t) {
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(1, t)) * total;
  const features = [];
  for (const band of bands) {
    const startKm = band.startFrac * total;
    if (startKm >= target - 1e-9) break; // this band is beyond the tip
    const endKm = Math.min(band.endFrac * total, target);
    if (endKm - startKm < 1e-9) continue; // collapsed band (a day with no
    // on-route stops inherits the previous boundary) — skip, don't stop
    const coords = [positionAt(line, cum, startKm / total)];
    for (let i = 0; i < line.length; i++) {
      if (cum[i] > startKm && cum[i] < endKm) coords.push(line[i]);
    }
    coords.push(positionAt(line, cum, endKm / total));
    features.push({
      type: 'Feature',
      properties: { color: band.color },
      geometry: { type: 'LineString', coordinates: coords },
    });
    if (endKm < band.endFrac * total) break; // partial band = we're at the tip
  }
  return { type: 'FeatureCollection', features };
}

// ---------- component ----------

export default function ItineraryDriveMap({
  routeLine = null,
  days = [],
  stops = [],
  totalMiles = null,
  startLabel = '',
  endLabel = '',
  height = '460px',
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const vehicleRef = useRef(null);
  const stopElsRef = useRef({});
  const rafRef = useRef(null);
  const progressRef = useRef(0);
  const lastTsRef = useRef(0);
  const scrubRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Panel state, updated only when the displayed values actually change so
  // the 60fps animation loop doesn't re-render React every frame.
  const [panel, setPanel] = useState({ day: 1, mile: 0, focusIdx: -1, done: false });

  const hasLine = Array.isArray(routeLine) && routeLine.length > 1;

  // All the derived geometry, computed once.
  const model = useMemo(() => {
    if (!hasLine) return null;
    const cum = cumulativeKm(routeLine);
    const totalKm = cum[cum.length - 1];
    if (totalKm <= 0) return null;
    const miles = Number(totalMiles) > 0 ? Number(totalMiles) : totalKm * 0.621371;

    const projected = stops
      .filter((s) => s.longitude != null && s.latitude != null)
      .map((s) => {
        const p = projectOntoLine(routeLine, cum, s.longitude, s.latitude);
        return {
          ...s,
          frac: p.alongKm / totalKm,
          offKm: p.offKm,
          onLinePoint: p.point,
          isSpur: p.offKm > SPUR_KM,
        };
      });
    if (projected.length < 2) return null;

    // Day bands: each day ends at its furthest-along on-route stop; the last
    // day runs to the end of the line. A day with no on-route stops (all
    // spurs) inherits the previous boundary and effectively collapses.
    const sortedDays = [...days].sort((a, b) => a.day_number - b.day_number);
    const bands = [];
    let prev = 0;
    sortedDays.forEach((d, i) => {
      const own = projected.filter((s) => s.day_number === d.day_number && !s.isSpur);
      let end = own.length > 0 ? Math.max(...own.map((s) => s.frac)) : prev;
      if (i === sortedDays.length - 1) end = 1;
      end = Math.max(end, prev);
      bands.push({
        day: d.day_number,
        title: d.title,
        startFrac: prev,
        endFrac: end,
        color: dayColor(d.day_number),
      });
      prev = end;
    });

    // Stops ordered by position along the drive (spurs by their turnoff).
    const ordered = [...projected].sort((a, b) => a.frac - b.frac);

    return { cum, totalKm, miles, bands, stops: ordered };
  }, [hasLine, routeLine, days, stops, totalMiles]);

  const dayForFrac = (t) => {
    if (!model) return 1;
    const band = model.bands.find((b) => t < b.endFrac) || model.bands[model.bands.length - 1];
    return band.day;
  };

  // ---------- map setup ----------

  useEffect(() => {
    if (!model || mapRef.current || !mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: 'Open Road Guide',
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          { id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 },
        ],
      },
      center: routeLine[Math.floor(routeLine.length / 2)],
      zoom: 6,
      interactive: true,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      // Base route: white casing + the full line in each day's color, faded.
      // Reuses the same slicer the animation uses (at t=1), so the day
      // boundaries fall at exactly interpolated points — no gaps, and every
      // feature is guaranteed a valid ≥2-coordinate LineString.
      map.addSource('drive-base', {
        type: 'geojson',
        data: slicedByDay(routeLine, model.cum, model.bands, 1),
      });
      map.addLayer({
        id: 'drive-base-casing',
        type: 'line',
        source: 'drive-base',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 7 },
      });
      map.addLayer({
        id: 'drive-base',
        type: 'line',
        source: 'drive-base',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.3 },
      });

      // Dashed connectors from spur stops to their turnoff on the line.
      const spurFeatures = model.stops
        .filter((s) => s.isSpur)
        .map((s) => ({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [[s.longitude, s.latitude], s.onLinePoint],
          },
        }));
      if (spurFeatures.length > 0) {
        map.addSource('drive-spurs', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: spurFeatures },
        });
        map.addLayer({
          id: 'drive-spurs',
          type: 'line',
          source: 'drive-spurs',
          paint: {
            'line-color': COLORS.ink,
            'line-width': 1.5,
            'line-opacity': 0.35,
            'line-dasharray': [2, 3],
          },
        });
      }

      // Traveled line, redrawn as progress moves.
      map.addSource('drive-traveled', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'drive-traveled',
        type: 'line',
        source: 'drive-traveled',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4.5 },
      });

      // Stop pins: small DOM dots that fill with their day's color once
      // reached. Spur stops render slightly larger with a hollow center.
      model.stops.forEach((s) => {
        const el = document.createElement('div');
        const c = dayColor(s.day_number);
        el.title = s.name;
        el.style.cssText = [
          `width:${s.isSpur ? 15 : 13}px`,
          `height:${s.isSpur ? 15 : 13}px`,
          'border-radius:50%',
          'background:#fff',
          `border:3px solid ${c}`,
          'box-shadow:0 1px 4px rgba(26,26,46,0.4)',
          'box-sizing:border-box',
          'transition:background 0.25s',
        ].join(';');
        stopElsRef.current[s.slug] = { el, color: c };
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([s.longitude, s.latitude])
          .setPopup(
            new maplibregl.Popup({ offset: 14, closeButton: false, maxWidth: '240px' }).setHTML(
              `<div style="font-family:'Outfit',sans-serif;padding:2px 2px;">
                 <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${c};margin-bottom:2px;">Day ${s.day_number}${s.isSpur ? ' &middot; side trip' : ''}</div>
                 <div style="font-family:'Fraunces',serif;font-size:14px;font-weight:700;color:${COLORS.ink};">${s.name}</div>
                 <a href="/poi/${s.slug}" style="display:inline-block;margin-top:5px;font-size:12px;font-weight:600;color:${COLORS.coral};text-decoration:none;">Read more &rarr;</a>
               </div>`
            )
          )
          .addTo(map);
      });

      // The vehicle marker.
      const vEl = document.createElement('div');
      vEl.style.cssText = [
        'width:20px',
        'height:20px',
        'border-radius:50%',
        `background:${dayColor(1)}`,
        'border:3.5px solid #fff',
        'box-shadow:0 2px 8px rgba(26,26,46,0.5)',
        'box-sizing:border-box',
      ].join(';');
      vehicleRef.current = { marker: null, el: vEl };
      vehicleRef.current.marker = new maplibregl.Marker({ element: vEl, anchor: 'center' })
        .setLngLat(routeLine[0])
        .addTo(map);

      // Frame the whole trip, spurs included.
      const bounds = new maplibregl.LngLatBounds();
      routeLine.forEach((c) => bounds.extend(c));
      model.stops.forEach((s) => bounds.extend([s.longitude, s.latitude]));
      map.fitBounds(bounds, { padding: 44, duration: 0 });

      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      vehicleRef.current = null;
      stopElsRef.current = {};
    };
    // The model is derived from props that don't change after the server
    // render, so a one-time setup effect is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ---------- rendering a progress value ----------

  const renderProgress = (t) => {
    const map = mapRef.current;
    if (!map || !model) return;
    progressRef.current = t;

    const src = map.getSource('drive-traveled');
    if (src) src.setData(slicedByDay(routeLine, model.cum, model.bands, t));

    const pos = positionAt(routeLine, model.cum, t);
    const day = dayForFrac(t);
    if (vehicleRef.current) {
      vehicleRef.current.marker.setLngLat(pos);
      vehicleRef.current.el.style.background = dayColor(day);
    }

    // Fill reached stops.
    let focusIdx = -1;
    model.stops.forEach((s, i) => {
      const reached = s.frac <= t + 0.0005;
      const entry = stopElsRef.current[s.slug];
      if (entry) entry.el.style.background = reached ? entry.color : '#fff';
      if (reached) focusIdx = i;
    });

    if (scrubRef.current) scrubRef.current.value = String(Math.round(t * 1000));

    const done = t >= 0.9995;
    const mile = Math.round(t * model.miles);
    setPanel((p) =>
      p.day === day && p.mile === mile && p.focusIdx === focusIdx && p.done === done
        ? p
        : { day, mile, focusIdx, done }
    );
  };

  // Initial paint once the map is ready.
  useEffect(() => {
    if (mapLoaded) renderProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // ---------- playback ----------

  const stop = () => {
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = 0;
  };

  const tick = (ts) => {
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dt = ts - lastTsRef.current;
    lastTsRef.current = ts;
    let t = progressRef.current + dt / PLAY_MS;
    if (t >= 1) {
      renderProgress(1);
      stop();
      return;
    }
    renderProgress(t);
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    if (progressRef.current >= 1) progressRef.current = 0;
    setPlaying(true);
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  };

  const onScrub = (e) => {
    stop();
    renderProgress(Number(e.target.value) / 1000);
  };

  const jumpToDay = (dayNumber) => {
    if (!model) return;
    stop();
    const band = model.bands.find((b) => b.day === dayNumber);
    renderProgress(band ? band.startFrac : 0);
  };

  // Nothing renderable — the page simply shows no map (the hopi-mesas rule,
  // applied to features: graceful absence beats a broken presence).
  if (!model) return null;

  const focus = panel.focusIdx >= 0 ? model.stops[panel.focusIdx] : null;
  const next = panel.focusIdx < model.stops.length - 1 ? model.stops[panel.focusIdx + 1] : null;
  const activeBand = model.bands.find((b) => b.day === panel.day) || model.bands[0];
  const milesTotal = Math.round(model.miles);

  return (
    <div style={ui.wrap}>
      <div ref={mapContainer} style={{ ...ui.map, height }} />

      <div style={ui.controls}>
        <div style={ui.chips}>
          {model.bands.map((b) => (
            <button
              key={b.day}
              type="button"
              onClick={() => jumpToDay(b.day)}
              style={{
                ...ui.chip,
                borderColor: panel.day === b.day ? b.color : '#ececec',
                boxShadow: panel.day === b.day ? `inset 0 0 0 1.5px ${b.color}` : 'none',
              }}
            >
              <span style={{ ...ui.chipDay, color: b.color }}>
                <span style={{ ...ui.chipDot, background: b.color }} />
                Day {b.day}
              </span>
              <span style={ui.chipTitle}>{b.title}</span>
            </button>
          ))}
        </div>

        <div style={ui.playRow}>
          <button
            type="button"
            onClick={playing ? stop : play}
            aria-label={playing ? 'Pause the drive' : 'Play the drive'}
            style={ui.playBtn}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <input
            ref={scrubRef}
            type="range"
            min="0"
            max="1000"
            step="1"
            defaultValue="0"
            onInput={onScrub}
            aria-label="Scrub along the drive"
            style={ui.scrub}
          />
        </div>

        <div style={ui.panel}>
          <div style={ui.panelBody}>
            <div style={{ ...ui.panelDay, color: activeBand.color }}>
              Day {panel.day} &middot; {activeBand.title}
            </div>
            {focus ? (
              <>
                <div style={ui.panelStop}>
                  <Link href={`/poi/${focus.slug}`} style={ui.panelStopLink}>
                    {focus.name}
                  </Link>
                  {focus.isSpur && <span style={ui.spurTag}>side trip</span>}
                </div>
                <div style={ui.panelNext}>
                  {panel.done || !next
                    ? endLabel
                      ? `Journey's end · ${endLabel}`
                      : "Journey's end"
                    : `Next: ${next.name} · ${Math.max(
                        0,
                        Math.round(next.frac * model.miles - panel.mile)
                      )} mi`}
                </div>
              </>
            ) : (
              <div style={ui.panelNext}>
                {startLabel ? `Setting out from ${startLabel}` : 'Setting out'}
                {next ? ` · first stop ${next.name}` : ''}
              </div>
            )}
          </div>
          <div style={ui.miles}>
            <div style={ui.milesN}>
              {panel.mile} / {milesTotal}
            </div>
            <div style={ui.milesL}>miles</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Styles (inline-object convention, matching the itinerary page) ----

const ui = {
  wrap: {
    border: '1px solid #ececec',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#fff',
  },
  map: { width: '100%' },
  controls: { padding: 'clamp(0.9rem, 2.5vw, 1.25rem)' },
  chips: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.25rem',
    marginBottom: '0.85rem',
    WebkitOverflowScrolling: 'touch',
  },
  chip: {
    flex: '1 0 auto',
    minWidth: '128px',
    maxWidth: '210px',
    textAlign: 'left',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '10px',
    padding: '0.5rem 0.6rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chipDay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  chipDot: { width: '8px', height: '8px', borderRadius: '50%', flex: '0 0 auto' },
  chipTitle: {
    display: 'block',
    fontSize: '0.72rem',
    color: COLORS.warmGray,
    marginTop: '0.2rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  playRow: { display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem' },
  playBtn: {
    flex: '0 0 auto',
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    background: COLORS.coral,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(255,107,107,0.5)',
  },
  scrub: { flex: '1 1 auto', accentColor: COLORS.ink, cursor: 'pointer', minWidth: 0 },
  panel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    background: COLORS.paper,
    border: '1px solid #ececec',
    borderRadius: '12px',
    padding: '0.85rem 1rem',
  },
  panelBody: { flex: '1 1 auto', minWidth: 0 },
  panelDay: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    marginBottom: '0.3rem',
  },
  panelStop: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.15rem',
    fontWeight: 600,
    lineHeight: 1.2,
    marginBottom: '0.25rem',
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  panelStopLink: {
    color: COLORS.ink,
    textDecoration: 'none',
    borderBottom: '1.5px solid rgba(255,107,107,0.5)',
  },
  spurTag: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: COLORS.warmGray,
    border: '1px solid #ddd',
    borderRadius: '99px',
    padding: '0.1rem 0.45rem',
  },
  panelNext: { fontSize: '0.85rem', color: COLORS.warmGray },
  miles: { flex: '0 0 auto', textAlign: 'right' },
  milesN: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
    fontSize: '1rem',
    letterSpacing: '-0.01em',
    color: COLORS.ink,
  },
  milesL: {
    fontSize: '0.6rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: COLORS.warmGray,
    marginTop: '0.1rem',
  },
};
