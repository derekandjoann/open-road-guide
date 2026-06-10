'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getCategoryColor } from '../lib/categoryColors';

export default function MapView({
  pois = [],
  historicalMarkers = [],
  interactive = true,
  height = '500px',
  onMarkerClick = null,
  compact = false,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const histMarkersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);

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
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [-111.75, 39.32],
      zoom: 6,
      interactive: interactive,
      attributionControl: true,
    });

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  // Add markers when map is loaded and POIs change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (pois.length === 0) return;

    pois.forEach((poi) => {
      if (!poi.longitude || !poi.latitude) return;

      const color = getCategoryColor(poi.category);

      const categoryLabel = poi.category
        ? poi.category.charAt(0).toUpperCase() + poi.category.slice(1)
        : 'Point of Interest';

      const popupHTML = `
        <div style="font-family: 'Outfit', sans-serif; max-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="
              display: inline-block;
              width: 10px; height: 10px;
              background: ${color};
              border-radius: 50%;
              flex-shrink: 0;
            "></span>
            <span style="
              font-size: 11px;
              font-weight: 600;
              color: ${color};
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">${categoryLabel}</span>
          </div>
          <div style="
            font-family: 'Fraunces', serif;
            font-size: 15px;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 4px;
            line-height: 1.25;
          ">${poi.name}</div>
          ${poi.tagline ? `<div style="font-size: 13px; color: #555; line-height: 1.4;">${poi.tagline}</div>` : ''}
          ${poi.visit_duration ? `<div style="font-size: 11px; color: #888; margin-top: 6px;">⏱ ${poi.visit_duration}</div>` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      }).setHTML(popupHTML);

      // Use MapLibre's built-in marker with color option
      // This avoids the CSS positioning bug with custom HTML markers
      const marker = new maplibregl.Marker({
        color: color,
        scale: compact ? 0.6 : 0.8,
      })
        .setLngLat([poi.longitude, poi.latitude])
        .setPopup(popup)
        .addTo(map);

      // Handle click callback for sidebar highlighting
      marker.getElement().addEventListener('click', () => {
        if (onMarkerClick) onMarkerClick(poi);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (pois.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      pois.forEach((poi) => {
        if (poi.longitude && poi.latitude) {
          bounds.extend([poi.longitude, poi.latitude]);
        }
      });
      map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
    }
  }, [pois, mapLoaded, compact, onMarkerClick]);

  // Historical marker layer — smaller violet pins, separate from POI markers.
  // These are roadside texture: they never participate in fitBounds (the POIs
  // frame the map; markers just appear where they stand), and they use the
  // same built-in maplibregl.Marker as POIs to avoid the custom-HTML
  // positioning bug.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    histMarkersRef.current.forEach((m) => m.remove());
    histMarkersRef.current = [];

    historicalMarkers.forEach((hm) => {
      if (!hm.longitude || !hm.latitude) return;

      const meta = [hm.erected_by, hm.year_erected].filter(Boolean).join(' · ');

      const popupHTML = `
        <div style="font-family: 'Outfit', sans-serif; max-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="
              display: inline-block;
              width: 10px; height: 10px;
              background: #9D4EDD;
              border-radius: 50%;
              flex-shrink: 0;
            "></span>
            <span style="
              font-size: 11px;
              font-weight: 600;
              color: #9D4EDD;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">Historical Marker</span>
          </div>
          <div style="
            font-family: 'Fraunces', serif;
            font-size: 15px;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 4px;
            line-height: 1.25;
          ">${hm.name}</div>
          ${hm.note ? `<div style="font-size: 13px; color: #555; line-height: 1.4;">${hm.note}</div>` : ''}
          ${meta ? `<div style="font-size: 11px; color: #888; margin-top: 6px;">${meta}</div>` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 18,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      }).setHTML(popupHTML);

      const marker = new maplibregl.Marker({
        color: '#9D4EDD',
        scale: compact ? 0.45 : 0.55,
      })
        .setLngLat([hm.longitude, hm.latitude])
        .setPopup(popup)
        .addTo(map);

      histMarkersRef.current.push(marker);
    });
  }, [historicalMarkers, mapLoaded, compact]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: height,
        borderRadius: compact ? '12px' : '16px',
        overflow: 'hidden',
      }}
    />
  );
}
