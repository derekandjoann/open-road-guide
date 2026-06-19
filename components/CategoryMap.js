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

// Convex hull (Andrew's monotone chain) on [lng,lat] points. Returns a closed
// ring (first point repeated) ready to drop into a GeoJSON Polygon. Fewer than
// three distinct points can't form an area, so callers skip those.
function hull(points) {
  const uniq = Array.from(
    new Map(points.map((p) => [p[0] + ',' + p[1], p])).values()
  );
  if (uniq.length < 3) return null;
  const pts = [...uniq].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const ring = lower.concat(upper);
  if (ring.length < 3) return null;
  ring.push(ring[0]);
  return ring;
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
          properties: { slug: r.slug, name: r.name },
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
            'line-color': '#FF6B6B',
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
        map.on('click', 'cat-routes-hit', (e) => {
          const slug = e.features[0].properties.slug;
          if (slug) router.push(`/route/${slug}`);
        });
      }
    }

    // ---------- REGIONS ----------
    if (mode === 'regions') {
      const feats = [];
      regions.forEach((r, i) => {
        const ring = hull(r.points || []);
        if (!ring) return;
        ring.forEach((c) => extend(c[0], c[1]));
        feats.push({
          type: 'Feature',
          id: i,
          properties: {
            slug: r.slug,
            name: r.name,
            color: REGION_COLORS[i % REGION_COLORS.length],
          },
          geometry: { type: 'Polygon', coordinates: [ring] },
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
              0.5,
              0.22,
            ],
          },
        });
        map.addLayer({
          id: 'cat-regions-line',
          type: 'line',
          source: 'cat-regions',
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              3.5,
              2,
            ],
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
        map.on('click', 'cat-regions-fill', (e) => {
          const slug = e.features[0].properties.slug;
          if (slug) router.push(`/region/${slug}`);
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

      stories.forEach((s) => {
        if (typeof s.lng !== 'number' || typeof s.lat !== 'number') return;
        const color = TYPE_COLORS[s.type] || '#FF6B6B';

        const el = document.createElement('div');
        el.style.boxSizing = 'border-box';
        el.style.cursor = 'pointer';
        el.style.borderRadius = '50%';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
        el.style.transition = 'transform 0.12s ease';
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
          el.style.transform = 'scale(1.15)';
          popup.setLngLat([s.lng, s.lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          popup.remove();
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          router.push(`/story/${s.slug}`);
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
