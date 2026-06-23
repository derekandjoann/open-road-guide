'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../../lib/supabase';
import { getCategoryColor, getCategoryEmoji } from '../../lib/categoryColors';

// Regions carry no category; give each a stable color by cycling the brand palette.
const REGION_PALETTE = ['#ff6b5b', '#12b5a0', '#ffb627', '#7c5cfc', '#f59e0b'];
// Fixed per-region colors: a proper 4-coloring of the region adjacency graph
// so no two regions that share a border get the same tint.
const REGION_COLORS = {
  'salt-lake-wasatch-front': '#7c5cfc',
  'park-city-wasatch-back': '#12b5a0',
  'utah-valley': '#ff6b5b',
  'cache-valley-bear-lake': '#ff6b5b',
  'central-utah': '#ffb627',
  'castle-country-san-rafael-swell': '#7c5cfc',
  'dinosaurland': '#ffb627',
  'moab-canyon-country': '#12b5a0',
  'capitol-reef-country': '#12b5a0',
  'trail-of-the-ancients': '#7c5cfc',
  'bryce-canyon-country': '#ff6b5b',
  'kanab-grand-staircase': '#ffb627',
  'greater-zion': '#7c5cfc',
  'cedar-breaks-brian-head': '#12b5a0',
};
// Stories colored by their type.
const STORY_TYPE_COLOR = { history: '#ffb627', culture: '#7c5cfc', geology: '#12b5a0', nature: '#ff6b5b' };
function storyColor(t) { return STORY_TYPE_COLOR[(t || '').toLowerCase()] || '#7c5cfc'; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// Monotone-chain convex hull over [lng,lat] points → closed ring, or null if < 3.
function convexHull(points) {
  const pts = points.filter(Boolean).map((p) => [p[0], p[1]]);
  if (pts.length < 3) return null;
  pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const ring = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (ring.length < 3) return null;
  ring.push(ring[0]);
  return ring;
}

const fc = (features) => ({ type: 'FeatureCollection', features });

export default function MapPage() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const addedRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [state, setState] = useState({ pois: true, routes: true, regions: false, stories: false });
  const [sheet, setSheet] = useState(null); // { kind, ...props }

  // Init map once.
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;
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
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 }],
      },
      center: [-111.55, 39.3],
      zoom: 5.7,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setMapLoaded(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; addedRef.current = false; };
  }, []);

  // Load all four overlays from live data. Each overlay is assembled defensively:
  // a failure in one never blanks the others.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [poiR, routeR, regionR, regionPoiR, storyR, storyPoiR] = await Promise.all([
          supabase.from('pois').select('id,slug,name,latitude,longitude,category,tagline,thumbnail_url').eq('published', true),
          supabase.from('routes').select('slug,name,total_miles,short_description,path_geojson').eq('published', true),
          supabase.from('regions').select('id,slug,name,short_description,bounds').eq('published', true),
          supabase.from('region_pois').select('region_id,poi_id'),
          supabase.from('stories').select('id,slug,title,story_type,excerpt').eq('published', true),
          supabase.from('story_pois').select('story_id,poi_id,sort_order'),
        ]);
        if (cancelled) return;
        if (poiR.error) throw poiR.error;

        const pois = poiR.data || [];
        const poiById = new Map(pois.map((p) => [p.id, p]));

        // POIs
        const poiFeatures = pois
          .filter((p) => p.longitude != null && p.latitude != null)
          .map((p) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
            properties: { kind: 'poi', slug: p.slug, name: p.name, category: p.category || '', tagline: p.tagline || '', color: getCategoryColor(p.category), thumb: p.thumbnail_url || '' },
          }));

        // Routes
        const routeFeatures = (routeR.data || [])
          .filter((r) => Array.isArray(r.path_geojson) && r.path_geojson.length > 1)
          .map((r) => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: r.path_geojson },
            properties: { kind: 'route', slug: r.slug, name: r.name, miles: r.total_miles != null ? Number(r.total_miles) : null, desc: r.short_description || '' },
          }));

        // Regions → hull of member POIs
        const regionMembers = new Map();
        (regionPoiR.data || []).forEach((rp) => {
          const p = poiById.get(rp.poi_id);
          if (!p || p.longitude == null || p.latitude == null) return;
          if (!regionMembers.has(rp.region_id)) regionMembers.set(rp.region_id, []);
          regionMembers.get(rp.region_id).push([p.longitude, p.latitude]);
        });
        const regionFeatures = [];
        (regionR.data || []).forEach((rg, i) => {
          // Prefer authored bounds (county-dissolved GeoJSON Polygon/MultiPolygon);
          // fall back to a convex hull of member POIs when bounds is null.
          let geometry = null;
          const b = rg.bounds;
          if (b && (b.type === 'Polygon' || b.type === 'MultiPolygon') && Array.isArray(b.coordinates)) {
            geometry = b;
          } else {
            const ring = convexHull(regionMembers.get(rg.id) || []);
            if (ring) geometry = { type: 'Polygon', coordinates: [ring] };
          }
          if (!geometry) return;
          regionFeatures.push({
            type: 'Feature',
            geometry,
            properties: { kind: 'region', slug: rg.slug, name: rg.name, desc: rg.short_description || '', color: REGION_COLORS[rg.slug] || REGION_PALETTE[i % REGION_PALETTE.length], count: (regionMembers.get(rg.id) || []).length },
          });
        });

        // Stories → arcs + ringed anchor points
        const storyMembers = new Map();
        (storyPoiR.data || []).forEach((sp) => {
          const p = poiById.get(sp.poi_id);
          if (!p || p.longitude == null || p.latitude == null) return;
          if (!storyMembers.has(sp.story_id)) storyMembers.set(sp.story_id, []);
          storyMembers.get(sp.story_id).push({ p, ord: sp.sort_order });
        });
        const storyArcFeatures = [];
        const storyPointFeatures = [];
        const storyDetail = {}; // slug -> { connects: [names] }
        (storyR.data || []).forEach((st) => {
          // Order POIs by authored sort_order (narrative sequence); any without
          // an order fall to the end, preserving a stable arc.
          const members = (storyMembers.get(st.id) || [])
            .slice()
            .sort((a, b) => (a.ord == null ? Infinity : a.ord) - (b.ord == null ? Infinity : b.ord))
            .map((x) => x.p);
          const color = storyColor(st.story_type);
          storyDetail[st.slug] = { connects: members.map((m) => m.name) };
          const coords = members.map((m) => [m.longitude, m.latitude]);
          if (coords.length > 1) {
            storyArcFeatures.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: { kind: 'story', slug: st.slug, title: st.title, stype: st.story_type || '', excerpt: st.excerpt || '', color },
            });
          }
          members.forEach((m) => storyPointFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
            properties: { kind: 'story', slug: st.slug, title: st.title, stype: st.story_type || '', excerpt: st.excerpt || '', color },
          }));
        });

        setData({
          counts: { pois: poiFeatures.length, routes: routeFeatures.length, regions: regionFeatures.length, stories: (storyR.data || []).length },
          poiFC: fc(poiFeatures),
          routeFC: fc(routeFeatures),
          regionFC: fc(regionFeatures),
          storyArcFC: fc(storyArcFeatures),
          storyPtFC: fc(storyPointFeatures),
          storyDetail,
        });
      } catch (e) {
        console.error('map data load failed', e);
        if (!cancelled) setErr('Some map data could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const vis = (on) => (on ? 'visible' : 'none');

  // Add sources + layers once map and data are both ready.
  useEffect(() => {
    if (!mapLoaded || !data || !mapRef.current || addedRef.current) return;
    const map = mapRef.current;
    addedRef.current = true;

    const tryAdd = (fn) => { try { fn(); } catch (e) { console.error('layer add failed', e); } };

    // Regions (bottom)
    tryAdd(() => {
      map.addSource('regions', { type: 'geojson', data: data.regionFC });
      map.addLayer({ id: 'regions-fill', type: 'fill', source: 'regions', layout: { visibility: vis(state.regions) }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'regions-outline', type: 'line', source: 'regions', layout: { visibility: vis(state.regions) }, paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 } });
    });
    // Routes
    tryAdd(() => {
      map.addSource('routes', { type: 'geojson', data: data.routeFC });
      map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { visibility: vis(state.routes), 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6 } });
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { visibility: vis(state.routes), 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff6b5b', 'line-width': 3.2 } });
    });
    // Stories
    tryAdd(() => {
      map.addSource('story-arcs', { type: 'geojson', data: data.storyArcFC });
      map.addLayer({ id: 'story-arcs', type: 'line', source: 'story-arcs', layout: { visibility: vis(state.stories), 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.4, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 } });
      map.addSource('story-points', { type: 'geojson', data: data.storyPtFC });
      map.addLayer({ id: 'story-rings', type: 'circle', source: 'story-points', layout: { visibility: vis(state.stories) }, paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-opacity': 0.14, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } });
    });
    // POIs (top)
    tryAdd(() => {
      map.addSource('pois', { type: 'geojson', data: data.poiFC });
      map.addLayer({ id: 'pois-layer', type: 'circle', source: 'pois', layout: { visibility: vis(state.pois) }, paint: { 'circle-radius': 5.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.6 } });
    });

    ['pois-layer', 'routes-line', 'regions-fill', 'story-arcs', 'story-rings'].forEach((id) => {
      if (!map.getLayer(id)) return;
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });

    // Frame Utah from the POIs.
    try {
      const b = new maplibregl.LngLatBounds();
      data.poiFC.features.forEach((f) => b.extend(f.geometry.coordinates));
      if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 9, duration: 0 });
    } catch (e) { /* keep default view */ }

    // Unified click → doorway sheet (priority: pins above lines above areas).
    map.on('click', (e) => {
      const order = [['pois-layer'], ['story-rings'], ['story-arcs'], ['routes-line'], ['regions-fill']];
      for (const [id] of order) {
        if (!map.getLayer(id) || map.getLayoutProperty(id, 'visibility') === 'none') continue;
        const hits = map.queryRenderedFeatures(e.point, { layers: [id] });
        if (hits.length) { setSheet({ ...hits[0].properties }); return; }
      }
      setSheet(null);
    });
  }, [mapLoaded, data, state]);

  function toggle(layer) {
    const next = { ...state, [layer]: !state[layer] };
    setState(next);
    const groups = { pois: ['pois-layer'], routes: ['routes-casing', 'routes-line'], regions: ['regions-fill', 'regions-outline'], stories: ['story-arcs', 'story-rings'] };
    const map = mapRef.current;
    if (map) groups[layer].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(next[layer])); });
  }

  const c = data ? data.counts : null;
  const toggles = [
    { key: 'pois', label: 'Places', sw: <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#ff6b5b' }} /> },
    { key: 'routes', label: 'Routes', sw: <span style={{ width: 16, height: 4, borderRadius: 2, background: '#ff6b5b' }} /> },
    { key: 'regions', label: 'Regions', sw: <span style={{ width: 13, height: 13, borderRadius: 4, background: 'rgba(124,92,252,.35)', border: '1px solid #7c5cfc' }} /> },
    { key: 'stories', label: 'Stories', sw: <span style={{ width: 16, borderTop: '3px dashed #7c5cfc' }} /> },
  ];

  // Sheet content
  let sheetEl = null;
  if (sheet) {
    const k = sheet.kind;
    const close = () => setSheet(null);
    if (k === 'poi') {
      sheetEl = doorwaySheet(close, getCategoryColor(sheet.category), cap(sheet.category), sheet.name, null, sheet.tagline, null, 'Open the place →', `/poi/${sheet.slug}`);
    } else if (k === 'route') {
      sheetEl = doorwaySheet(close, '#ff6b5b', 'Route', sheet.name, sheet.miles ? `${Math.round(sheet.miles)} miles` : '', sheet.desc, null, 'Open the route →', `/route/${sheet.slug}`);
    } else if (k === 'region') {
      sheetEl = doorwaySheet(close, sheet.color, 'Region', sheet.name, sheet.count ? `${sheet.count} places` : '', sheet.desc, null, 'Open the region →', `/region/${sheet.slug}`);
    } else if (k === 'story') {
      const det = (data && data.storyDetail[sheet.slug]) || { connects: [] };
      sheetEl = doorwaySheet(close, sheet.color, `${sheet.stype} · Story`, sheet.title, '', sheet.excerpt, det.connects, 'Read the story →', `/story/${sheet.slug}`);
    }
  }

  return (
    <div style={{ position: 'relative', height: 'calc(100dvh - 0px)', display: 'flex', flexDirection: 'column', background: '#1a1a2e', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        .nm-toggle{flex:0 0 auto;display:flex;align-items:center;gap:7px;border-radius:999px;padding:7px 13px 7px 10px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#cdd0e0;transition:all .15s}
        .nm-toggle[aria-pressed="true"]{background:#fff;color:#1a1a2e;border-color:#fff}
        .nm-sheet{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:0 10px 10px;animation:nmUp .28s cubic-bezier(.3,.8,.3,1)}
        @keyframes nmUp{from{transform:translateY(110%)}to{transform:translateY(0)}}
      `}</style>

      <header style={{ padding: '11px 16px 9px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: '0 0 auto' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9aa0c0' }}>Open Road Guide</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 21, margin: '1px 0 0', letterSpacing: '-.01em' }}>The Map</h1>
        </div>
        {c && <div style={{ fontSize: 11.5, color: '#9aa0c0', textAlign: 'right', lineHeight: 1.3 }}>{c.pois} places · {c.routes} routes<br />{c.regions} regions · {c.stories} stories</div>}
      </header>

      <div style={{ display: 'flex', gap: 7, padding: '2px 14px 11px', overflowX: 'auto', flex: '0 0 auto' }}>
        {toggles.map((t) => (
          <button key={t.key} className="nm-toggle" aria-pressed={state[t.key]} onClick={() => toggle(t.key)}>
            {t.sw}{t.label}
          </button>
        ))}
      </div>

      <div ref={mapContainer} style={{ flex: '1 1 auto', width: '100%' }} />

      {!data && !err && (
        <div style={{ position: 'absolute', top: '52%', left: 0, right: 0, textAlign: 'center', color: '#cdd0e0', fontSize: 13 }}>Loading the map…</div>
      )}
      {err && (
        <div style={{ position: 'absolute', top: 110, left: 16, right: 16, background: 'rgba(255,107,91,.15)', color: '#ffd7d1', borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>{err}</div>
      )}

      {!sheet && (
        <div style={{ position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(26,26,46,.86)', color: '#fff', fontSize: 12.5, padding: '8px 14px', borderRadius: 999, pointerEvents: 'none' }}>
          Tap any pin, road, area, or story arc to open its page
        </div>
      )}

      {sheetEl}
    </div>
  );
}

function doorwaySheet(close, color, typeLabel, name, meta, body, connects, doorLabel, href) {
  return (
    <div className="nm-sheet">
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: '20px 20px 16px 16px', boxShadow: '0 -10px 40px rgba(0,0,0,.28)', padding: '16px 18px 18px', position: 'relative' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: '#e2ddd2', margin: '2px auto 12px' }} />
        <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 13, right: 14, width: 30, height: 30, border: 'none', borderRadius: '50%', background: '#f3f0e8', color: '#6b7280', fontSize: 17, cursor: 'pointer', lineHeight: 1 }}>×</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />{typeLabel}
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 21, margin: '6px 0 3px', lineHeight: 1.12, paddingRight: 30 }}>{name}</h2>
        {meta ? <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 9 }}>{meta}</div> : null}
        {body ? <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3c4256', margin: '0 0 14px' }}>{body}</p> : <div style={{ height: 6 }} />}
        {connects && connects.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 14px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', width: '100%', marginBottom: 2 }}>Connects these places</div>
            {connects.map((n) => (
              <span key={n} style={{ fontSize: 12, background: '#f6f3ec', border: '1px solid #ece9e2', borderRadius: 999, padding: '5px 10px' }}>{n}</span>
            ))}
          </div>
        ) : null}
        <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#1a1a2e', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, borderRadius: 12, padding: '12px 16px', width: '100%' }}>{doorLabel}</Link>
      </div>
    </div>
  );
}
