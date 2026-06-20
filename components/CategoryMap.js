'use client';

// CategoryMap — the explorable Utah map that sits atop each category index
// page. One component, three modes: it draws every published route line, every
// region footprint, or every story pin, each one clickable through to its page.
//
// It deliberately reuses the same keyless OpenStreetMap raster basemap as
// components/MapView.js so these maps match /explore and the detail pages
// exactly. MapView is built for a single route + its stops; this is its
// many-at-once sibling, kept separate so editing it can never regress MapView.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Story-type pin colors. History/Culture/Nature reuse brand hues; Geology uses
// a darker amber than the brand yellow so a pin reads against a light basemap.
const TYPE_COLORS = {
  History: '#9D4EDD',
  Culture: '#FF6B6B',
  Geology: '#E8A11C',
  Nature: '#2FB3A8',
};

// 14 distinct, earthy hues — one per region, assigned by the (name-sorted)
// order the page passes them in, so a region's color is stable across loads.
const REGION_COLORS = [
  '#C1432E', '#D9772B', '#C99A2E', '#7E8A2E', '#4F8F4A', '#2E9E83', '#3E9CC0',
  '#3E6FB0', '#6A5BAE', '#8E4FA0', '#B5468A', '#C24E6A', '#7C6A55', '#5B8C7B',
];

// Same OSM raster basemap as MapView, so the look is consistent site-wide.
const BASEMAP_STYLE = {
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
};

// ---------------------------------------------------------------------------
// Region "puzzle" geometry. Each region becomes one piece of a tessellation
// that fills the whole state: every point in Utah is assigned to the region
// whose POI centroid is nearest (a Voronoi partition), then clipped to the
// state outline — no gaps, no overlaps. The math runs in an aspect-corrected
// projection (lng * K, lat) so "nearest" matches real ground distance at
// Utah's latitude, then un-projects back to lng/lat for the map.
// ---------------------------------------------------------------------------
const PUZZLE_K = Math.cos((39.5 * Math.PI) / 180);

// Utah's outline for a faint state border (lng/lat): a big rectangle minus the
// northeast (Wyoming) corner.
const UTAH_OUTLINE = [
  [-114.052, 36.998], [-114.052, 42.002], [-111.047, 42.002],
  [-111.047, 41.001], [-109.041, 41.001], [-109.041, 36.998],
  [-114.052, 36.998],
];

// That same outline as two convex rectangles (their union is Utah), in
// projected x (= lng * PUZZLE_K) and raw lat — used to clip every cell.
const UTAH_RECTS = [
  { xmin: -114.052 * PUZZLE_K, xmax: -111.047 * PUZZLE_K, ymin: 36.998, ymax: 42.002 },
  { xmin: -111.047 * PUZZLE_K, xmax: -109.041 * PUZZLE_K, ymin: 36.998, ymax: 41.001 },
];

// A starting polygon comfortably larger than the state (projected coords).
const PUZZLE_BOUNDS = [
  [-118 * PUZZLE_K, 35], [-106 * PUZZLE_K, 35],
  [-106 * PUZZLE_K, 44], [-118 * PUZZLE_K, 44],
];

// Sutherland–Hodgman: keep the part of `poly` where nx*x + ny*y <= c.
function clipHalf(poly, nx, ny, c) {
  const out = [];
  const n = poly.length;
  if (!n) return out;
  const side = (p) => nx * p[0] + ny * p[1] - c;
  const cut = (a, b, da, db) => {
    const t = da / (da - db);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const prev = poly[(i + n - 1) % n];
    const dc = side(cur);
    const dp = side(prev);
    const ci = dc <= 1e-12;
    const pi = dp <= 1e-12;
    if (ci) {
      if (!pi) out.push(cut(prev, cur, dp, dc));
      out.push(cur);
    } else if (pi) {
      out.push(cut(prev, cur, dp, dc));
    }
  }
  return out;
}

// Clip a ring to an axis-aligned rectangle (projected coords).
function clipRect(poly, R) {
  let o = poly;
  o = clipHalf(o, -1, 0, -R.xmin);
  o = clipHalf(o, 1, 0, R.xmax);
  o = clipHalf(o, 0, -1, -R.ymin);
  o = clipHalf(o, 0, 1, R.ymax);
  return o;
}

// Voronoi cell of seed i = the bounds clipped by the perpendicular bisector
// against every other seed (all seeds in projected coords).
function voronoiCell(i, seeds) {
  let cell = PUZZLE_BOUNDS.slice();
  const s = seeds[i];
  for (let j = 0; j < seeds.length; j++) {
    if (j === i) continue;
    const t = seeds[j];
    const nx = t[0] - s[0];
    const ny = t[1] - s[1];
    if (nx === 0 && ny === 0) continue;
    const c = (t[0] * t[0] + t[1] * t[1] - (s[0] * s[0] + s[1] * s[1])) / 2;
    cell = clipHalf(cell, nx, ny, c);
    if (cell.length < 3) break;
  }
  return cell;
}

// Build each region's puzzle piece as lng/lat MultiPolygon coordinates. A
// region whose cell straddles the state's notched corner yields two rings.
function regionPieces(regions) {
  const seeded = regions.filter(
    (r) => Array.isArray(r.points) && r.points.length
  );
  const seeds = seeded.map((r) => {
    let x = 0;
    let y = 0;
    r.points.forEach((p) => {
      x += p[0] * PUZZLE_K;
      y += p[1];
    });
    return [x / r.points.length, y / r.points.length];
  });
  return seeded.map((r, i) => {
    const cell = voronoiCell(i, seeds);
    const polys = [];
    UTAH_RECTS.forEach((R) => {
      const clipped = clipRect(cell, R);
      if (clipped.length >= 3) {
        const ring = clipped.map((p) => [p[0] / PUZZLE_K, p[1]]);
        ring.push(ring[0]); // close the ring
        polys.push([ring]);
      }
    });
    return { slug: r.slug, name: r.name, color: r.color, polys };
  });
}

export default function CategoryMap({
  mode,
  routes = [],
  regions = [],
  stories = [],
  height = 'clamp(340px, 52vh, 480px)',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const hoverPopupRef = useRef(null);
  const wiredRef = useRef({}); // tracks which layer click/hover handlers are attached
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [-111.6, 39.35],
      zoom: 5.6,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setLoaded(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw / update data whenever it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const bounds = new maplibregl.LngLatBounds();
    let nBound = 0;
    const extend = (lng, lat) => {
      if (typeof lng === 'number' && typeof lat === 'number') {
        bounds.extend([lng, lat]);
        nBound += 1;
      }
    };
    const showHover = (lngLat, text) => {
      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          offset: 12,
          closeButton: false,
          closeOnClick: false,
        });
      }
      hoverPopupRef.current.setLngLat(lngLat).setText(text).addTo(map);
    };
    const hideHover = () => {
      if (hoverPopupRef.current) hoverPopupRef.current.remove();
    };

    // ---------- ROUTES ----------
    if (mode === 'routes') {
      const feats = routes
        .filter((r) => Array.isArray(r.path) && r.path.length > 1)
        .map((r, i) => ({
          type: 'Feature',
          id: i,
          // color is assigned per route by the page (name-sorted order) so a
          // route's line matches its card exactly; fall back to brand coral.
          properties: { slug: r.slug, name: r.name, color: r.color || '#FF6B6B' },
          geometry: { type: 'LineString', coordinates: r.path },
        }));
      feats.forEach((f) =>
        f.geometry.coordinates.forEach((c) => extend(c[0], c[1]))
      );
      const data = { type: 'FeatureCollection', features: feats };

      if (map.getSource('cat-routes')) {
        map.getSource('cat-routes').setData(data);
      } else {
        map.addSource('cat-routes', { type: 'geojson', data });
        map.addLayer({
          id: 'cat-routes-casing',
          type: 'line',
          source: 'cat-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FFFFFF', 'line-width': 6 },
        });
        map.addLayer({
          id: 'cat-routes-line',
          type: 'line',
          source: 'cat-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              6,
              3,
            ],
          },
        });
        // Wide transparent line on top = a forgiving tap/hover target.
        map.addLayer({
          id: 'cat-routes-hit',
          type: 'line',
          source: 'cat-routes',
          paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
        });
      }

      if (!wiredRef.current.routes) {
        wiredRef.current.routes = true;
        let hovId = null;
        map.on('mousemove', 'cat-routes-hit', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features[0];
          if (hovId !== null && hovId !== f.id)
            map.setFeatureState({ source: 'cat-routes', id: hovId }, { hover: false });
          hovId = f.id;
          map.setFeatureState({ source: 'cat-routes', id: hovId }, { hover: true });
          showHover(e.lngLat, f.properties.name);
        });
        map.on('mouseleave', 'cat-routes-hit', () => {
          map.getCanvas().style.cursor = '';
          if (hovId !== null)
            map.setFeatureState({ source: 'cat-routes', id: hovId }, { hover: false });
          hovId = null;
          hideHover();
        });
        // Touch devices have no hover, so the first tap on a line reveals its
        // name and a second tap on the same line opens it. Pointer devices
        // (hover) keep single-click, since hovering already shows the name.
        const canHover =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(hover: hover)').matches;
        let armedSlug = null;
        let armedId = null;
        map.on('click', 'cat-routes-hit', (e) => {
          const f = e.features[0];
          const slug = f.properties.slug;
          if (!slug) return;
          if (canHover || armedSlug === slug) {
            router.push(`/route/${slug}`);
            return;
          }
          // First tap on touch: reveal the name and wait for a confirming tap.
          if (armedId !== null && armedId !== f.id)
            map.setFeatureState({ source: 'cat-routes', id: armedId }, { hover: false });
          armedSlug = slug;
          armedId = f.id;
          map.setFeatureState({ source: 'cat-routes', id: f.id }, { hover: true });
          showHover(e.lngLat, f.properties.name);
        });
      }
    }

    // ---------- REGIONS ----------
    if (mode === 'regions') {
      const feats = [];
      const pieces = regionPieces(regions);
      pieces
        .filter((p) => p.polys.length)
        .forEach((p, i) => {
          p.polys.forEach((poly) =>
            poly[0].forEach((c) => extend(c[0], c[1]))
          );
          feats.push({
            type: 'Feature',
            id: i,
            properties: {
              slug: p.slug,
              name: p.name,
              color: p.color || REGION_COLORS[i % REGION_COLORS.length],
            },
            geometry: { type: 'MultiPolygon', coordinates: p.polys },
          });
        });
      const data = { type: 'FeatureCollection', features: feats };

      if (map.getSource('cat-regions')) {
        map.getSource('cat-regions').setData(data);
      } else {
        map.addSource('cat-regions', { type: 'geojson', data });
        map.addLayer({
          id: 'cat-regions-fill',
          type: 'fill',
          source: 'cat-regions',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.74,
              0.52,
            ],
          },
        });
        // White seams between the pieces give the jigsaw-puzzle look.
        map.addLayer({
          id: 'cat-regions-line',
          type: 'line',
          source: 'cat-regions',
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.9,
          },
        });
        // A faint dark outline of Utah anchors the puzzle to the whole state.
        map.addSource('cat-utah', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: UTAH_OUTLINE },
          },
        });
        map.addLayer({
          id: 'cat-utah-line',
          type: 'line',
          source: 'cat-utah',
          paint: {
            'line-color': '#1a1a2e',
            'line-opacity': 0.45,
            'line-width': 1.3,
          },
        });
      }

      if (!wiredRef.current.regions) {
        wiredRef.current.regions = true;
        let hovId = null;
        map.on('mousemove', 'cat-regions-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features[0];
          if (hovId !== null && hovId !== f.id)
            map.setFeatureState({ source: 'cat-regions', id: hovId }, { hover: false });
          hovId = f.id;
          map.setFeatureState({ source: 'cat-regions', id: hovId }, { hover: true });
          showHover(e.lngLat, f.properties.name);
        });
        map.on('mouseleave', 'cat-regions-fill', () => {
          map.getCanvas().style.cursor = '';
          if (hovId !== null)
            map.setFeatureState({ source: 'cat-regions', id: hovId }, { hover: false });
          hovId = null;
          hideHover();
        });
        // Touch devices have no hover, so a single tap would jump straight into
        // a region with no chance to read its name. There, the first tap reveals
        // the name and highlights the piece; a second tap on the same piece
        // opens it. Devices with a real pointer (hover) keep single-click to
        // open, since hovering already shows the name.
        const canHover =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(hover: hover)').matches;
        let armedSlug = null;
        let armedId = null;
        map.on('click', 'cat-regions-fill', (e) => {
          const f = e.features[0];
          const slug = f.properties.slug;
          if (!slug) return;
          if (canHover || armedSlug === slug) {
            router.push(`/region/${slug}`);
            return;
          }
          // First tap on touch: reveal the name and wait for a confirming tap.
          if (armedId !== null && armedId !== f.id)
            map.setFeatureState({ source: 'cat-regions', id: armedId }, { hover: false });
          armedSlug = slug;
          armedId = f.id;
          map.setFeatureState({ source: 'cat-regions', id: f.id }, { hover: true });
          showHover(e.lngLat, f.properties.name);
        });
      }
    }

    // ---------- STORIES ----------
    if (mode === 'stories') {
      // Rebuild DOM markers each pass (cheap at this count). Hero thumbnails use
      // a clean fixed-size element with anchor:'center' and no self-applied
      // transform, which sidesteps the custom-marker positioning issue.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Touch devices have no hover, so the first tap on a pin reveals its
      // title and a second tap on the same pin opens the story. Pointer devices
      // (hover) keep single-click, since hovering already shows the title.
      const canHover =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(hover: hover)').matches;
      let armedSlug = null;
      let armedPopup = null;
      let armedEl = null;

      stories.forEach((s) => {
        if (typeof s.lng !== 'number' || typeof s.lat !== 'number') return;
        const color = TYPE_COLORS[s.type] || '#FF6B6B';

        const el = document.createElement('div');
        el.style.boxSizing = 'border-box';
        el.style.cursor = 'pointer';
        el.style.borderRadius = '50%';
        const baseShadow = '0 2px 6px rgba(0,0,0,0.35)';
        // A glow ring (box-shadow) emphasizes the armed/hovered pin WITHOUT a
        // CSS transform: MapLibre positions the marker with its own transform on
        // this element, so scaling it here would clobber the pin's position.
        const ringShadow = `0 0 0 3px #ffffff, 0 0 0 6px ${color}, 0 3px 8px rgba(0,0,0,0.4)`;
        el.style.boxShadow = baseShadow;
        el.style.transition = 'box-shadow 0.12s ease';
        if (s.hero) {
          el.style.width = '40px';
          el.style.height = '40px';
          el.style.border = `3px solid ${color}`;
          el.style.backgroundImage = `url("${s.hero}")`;
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
        } else {
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.border = '2px solid #fff';
          el.style.background = color;
        }

        const popup = new maplibregl.Popup({
          offset: 22,
          closeButton: false,
          closeOnClick: false,
        }).setText(s.title);

        el.addEventListener('mouseenter', () => {
          el.style.boxShadow = ringShadow;
          popup.setLngLat([s.lng, s.lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          el.style.boxShadow = baseShadow;
          popup.remove();
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (canHover || armedSlug === s.slug) {
            router.push(`/story/${s.slug}`);
            return;
          }
          // First tap on touch: reveal the title, wait for a confirming tap.
          if (armedPopup) armedPopup.remove();
          if (armedEl) armedEl.style.boxShadow = baseShadow;
          armedSlug = s.slug;
          armedPopup = popup;
          armedEl = el;
          el.style.boxShadow = ringShadow;
          popup.setLngLat([s.lng, s.lat]).addTo(map);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        markersRef.current.push(marker);
        extend(s.lng, s.lat);
      });
    }

    if (nBound > 1) {
      map.fitBounds(bounds, { padding: 44, maxZoom: 9, duration: 0 });
    }
  }, [loaded, mode, routes, regions, stories, router]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Interactive map of Utah"
      style={{
        width: '100%',
        height,
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #ececec',
      }}
    />
  );
}
