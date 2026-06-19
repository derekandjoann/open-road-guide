'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/MapView';
import { getCategoryColor, getCategoryEmoji } from '../../lib/categoryColors';
import { toSlug } from '../../lib/slug'; 

// Serve a small, right-sized thumbnail from Supabase's image render endpoint
// rather than the multi-megabyte original. Falls back to the original URL
// untouched if it isn't in the expected public-object form.
function thumbSrc(url, width = 160) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

export default function ExplorePage() {
  const [pois, setPois] = useState([]);
  const [filteredPois, setFilteredPois] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  // Ranked results from the search_pois() full-text RPC. null = RPC inactive
  // (query empty/too short, still in flight, or errored) — in that case the
  // legacy substring filter below applies, so search never breaks.
  const [searchResults, setSearchResults] = useState(null);
  const [selectedPoi, setSelectedPoi] = useState(null);
  // Historical markers — the violet pin layer. Loaded once; not filtered,
  // searched, or counted with POIs. They are roadside texture on the map.
  const [histMarkers, setHistMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Mobile layout switch: stack map over list below 768px. matchMedia with a
  // change listener keeps it correct through rotation; initial false avoids
  // SSR/window access issues since this only renders meaningfully client-side.
  const [isMobile, setIsMobile] = useState(false);
  // Measured height of the sticky search+chips controls pane on mobile. Feeds
  // the map's sticky `top` and the cards' scroll-margin so the map pins right
  // below the controls and a tapped card clears the whole stack. 0 on desktop.
  const [controlsH, setControlsH] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const listRef = useRef(null);
  const controlsRef = useRef(null);
  // Track the controls pane's real rendered height. A ResizeObserver catches
  // everything that can change it — rotation, the search field wrapping, late
  // font load, the category chips arriving after fetch — and keeps the map's
  // offset exact without hardcoding a height. Off (and zeroed) on desktop.
  useEffect(() => {
    if (!isMobile) {
      setControlsH(0);
      return;
    }
    const el = controlsRef.current;
    if (!el) return;
    const measure = () => setControlsH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  // Fetch POIs
  useEffect(() => {
    async function fetchPois() {
      const { data, error } = await supabase
        .from('pois')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching POIs:', error);
      } else {
        setPois(data);
        setFilteredPois(data);
        const cats = [...new Set(data.map(p => p.category).filter(Boolean))].sort();
        setCategories(cats);
      }
      setLoading(false);
    }
    fetchPois();

    // Historical marker layer — fetched separately so a failure here can
    // never affect the POI list; the map simply renders without violet pins.
    async function fetchMarkers() {
      const { data, error } = await supabase
        .from('markers')
        .select('id, name, latitude, longitude, erected_by, year_erected, note');
      if (error) {
        console.error('Error fetching historical markers:', error);
      } else {
        setHistMarkers(data || []);
      }
    }
    fetchMarkers();
  }, []);

  // Full-text search via the search_pois() RPC — debounced, race-safe.
  // Matches words anywhere in a POI's name, tagline, or full description
  // (with English stemming), ranked by relevance. Queries shorter than three
  // characters skip the RPC; the substring filter handles those better.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_pois', {
        search_query: q,
        max_results: 100,
      });
      if (cancelled) return;
      if (error) {
        console.error('search_pois error:', error);
        setSearchResults(null); // fall back to substring filtering
      } else {
        setSearchResults(data || []);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Filter
  useEffect(() => {
    let result = pois;
    if (searchQuery.trim()) {
      if (searchResults !== null) {
        // Ranked full-text results: map RPC ids back to the fully loaded POI
        // objects so cards and map markers keep every field, in rank order.
        const byId = new Map(pois.map(p => [p.id, p]));
        result = searchResults.map(r => byId.get(r.id)).filter(Boolean);
      } else {
        const q = searchQuery.toLowerCase();
        result = result.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.tagline && p.tagline.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
        );
      }
    }
    if (activeCategory !== 'All') {
      result = result.filter(p => p.category === activeCategory);
    }
    setFilteredPois(result);
  }, [activeCategory, searchQuery, searchResults, pois]);

  // Scroll to selected POI. On mobile the map is a sticky pane pinned to the
  // top of the page, so a tapped card must align to 'start' (its scroll-margin
  // clears the pinned map) rather than 'center', which would land it behind
  // the map. On desktop the sidebar scrolls internally, so 'center' is right.
  useEffect(() => {
    if (selectedPoi && listRef.current) {
      const el = listRef.current.querySelector(`[data-poi-id="${selectedPoi.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: isMobile ? 'start' : 'center' });
    }
  }, [selectedPoi, isMobile]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f7f4',
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Search + category controls. On mobile this whole block is sticky,
          pinned under the global nav (top:94px) so the search field and the
          filter chips stay on screen while the card list scrolls beneath the
          map. Wrapping the two existing blocks keeps desktop byte-identical —
          a plain static block div — while its measured height (controlsH)
          drives the map's sticky top and the cards' scroll-margin below. */}
      <div
        ref={controlsRef}
        style={{
          position: isMobile ? 'sticky' : 'static',
          top: isMobile ? '94px' : 'auto',
          zIndex: isMobile ? 40 : 'auto',
        }}
      >
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: '20px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{
            fontFamily: "'Fraunces', serif",
            fontSize: '22px',
            fontWeight: 800,
            color: '#ff6b5b',
          }}>Open Road Guide</span>
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>Explore Utah</span>
        </a>

        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <input
            type="text"
            placeholder="Search places, stories, geology..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 36px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '14px',
              fontFamily: "'Outfit', sans-serif",
              outline: 'none',
            }}
          />
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '16px',
            opacity: 0.5,
          }}>🔍</span>
        </div>
      </header>

      {/* Category Filters */}
      <div style={{
        padding: '12px 28px',
        background: '#fff',
        borderBottom: '1px solid #e8e6e1',
        overflowX: 'auto',
        display: 'flex',
        gap: '8px',
        whiteSpace: 'nowrap',
      }}>
        <FilterChip
          label="All"
          count={pois.length}
          active={activeCategory === 'All'}
          color="#1a1a2e"
          onClick={() => setActiveCategory('All')}
        />
        {categories.map(cat => {
          const color = getCategoryColor(cat);
          const label = cat.charAt(0).toUpperCase() + cat.slice(1);
          return (
            <FilterChip
              key={cat}
              label={label}
              count={pois.filter(p => p.category === cat).length}
              active={activeCategory === cat}
              color={color}
              onClick={() => setActiveCategory(cat)}
            />
          );
        })}
      </div>
      </div>
      {/* end sticky controls wrapper */}

      {/* Map + Sidebar — side-by-side on desktop, stacked on mobile */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        height: isMobile ? 'auto' : 'calc(100vh - 130px)',
      }}>
        {/* Map — on mobile this is a sticky pane pinned just below the sticky
            controls block (which itself sits under the 94px global nav), so
            the card list scrolls beneath a map that stays in view. Its top is
            94px + the controls' measured height; z-index 20 sits above the
            cards but below the controls (40) and nav (100). On desktop it's a
            normal flex pane. */}
        <div style={{
          flex: isMobile ? 'none' : 1,
          position: isMobile ? 'sticky' : 'relative',
          top: isMobile ? `${94 + controlsH}px` : 'auto',
          zIndex: isMobile ? 20 : 'auto',
          height: isMobile ? '45vh' : 'auto',
          minHeight: isMobile ? '300px' : 0,
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              background: '#e8e6e1',
            }}>
              <div style={{
                fontFamily: "'Fraunces', serif",
                fontSize: '20px',
                color: '#888',
              }}>Loading map...</div>
            </div>
          ) : (
            <MapView
              pois={filteredPois}
              historicalMarkers={histMarkers}
              interactive={true}
              height="100%"
              compact={false}
              onMarkerClick={(poi) => setSelectedPoi(poi)}
            />
          )}

          {/* Result count */}
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: '#1a1a2e',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 5,
          }}>
            {filteredPois.length} {filteredPois.length === 1 ? 'place' : 'places'}
            {activeCategory !== 'All' ? ` · ${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}` : ''}
          </div>
        </div>

        {/* Sidebar */}
        <div
          ref={listRef}
          style={{
            width: isMobile ? '100%' : '360px',
            overflowY: isMobile ? 'visible' : 'auto',
            background: '#fff',
            borderLeft: isMobile ? 'none' : '1px solid #e8e6e1',
            borderTop: isMobile ? '1px solid #e8e6e1' : 'none',
          }}
        >
          <div style={{
            padding: '16px 20px 8px',
            fontFamily: "'Fraunces', serif",
            fontSize: '18px',
            fontWeight: 700,
            color: '#1a1a2e',
            borderBottom: '1px solid #f0eeea',
          }}>
            Places to Discover
          </div>

          {filteredPois.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              No places match your filters.
            </div>
          ) : (
            filteredPois.map((poi) => (
              <PoiCard
                key={poi.id}
                poi={poi}
                isSelected={selectedPoi?.id === poi.id}
                isMobile={isMobile}
                controlsH={controlsH}
                onClick={() => setSelectedPoi(poi)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* Filter Chip */
function FilterChip({ label, count, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '7px 14px',
        borderRadius: '20px',
        border: active ? `2px solid ${color}` : '2px solid transparent',
        background: active ? `${color}14` : '#f5f4f1',
        cursor: 'pointer',
        fontFamily: "'Outfit', sans-serif",
        fontSize: '13px',
        fontWeight: active ? 600 : 500,
        color: active ? color : '#666',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label !== 'All' && (
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }} />
      )}
      {label}
      <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.6 }}>{count}</span>
    </button>
  );
}

/* Sidebar POI Card */
function PoiCard({ poi, isSelected, isMobile, controlsH = 0, onClick }) {
  const color = getCategoryColor(poi.category);
  const label = poi.category
    ? poi.category.charAt(0).toUpperCase() + poi.category.slice(1)
    : 'Place';

  return (
    <div
      data-poi-id={poi.id}
      onClick={onClick}
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f0eeea',
        cursor: 'pointer',
        background: isSelected ? '#faf9f7' : '#fff',
        borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
        transition: 'all 0.15s ease',
        // Clears the full pinned stack — nav (94px) + sticky search/chips
        // controls (controlsH) + 45vh map — when scrollIntoView aligns this
        // card to 'start' on mobile; harmless on desktop. controlsH arrives by
        // prop so the margin tracks the controls' real measured height.
        scrollMarginTop: isMobile ? `calc(${94 + controlsH}px + 45vh + 10px)` : undefined,
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {poi.thumbnail_url && (
          <img
            src={thumbSrc(poi.thumbnail_url)}
            alt={poi.name}
            loading="lazy"
            style={{
              width: '60px',
              height: '60px',
              objectFit: 'cover',
              borderRadius: '8px',
              flexShrink: 0,
              background: '#f0ebe4',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: color,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>{label}</span>
      </div>

      <div style={{
        fontFamily: "'Fraunces', serif",
        fontSize: '15px',
        fontWeight: 700,
        color: '#1a1a2e',
        lineHeight: 1.3,
        marginBottom: '4px',
      }}>{poi.name}</div>

      {poi.tagline && (
        <div style={{ fontSize: '13px', color: '#777', lineHeight: 1.4 }}>{poi.tagline}</div>
      )}

       <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '8px',
      }}>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#999' }}>
          {poi.visit_duration && <span>⏱ {poi.visit_duration}</span>}
          {poi.admission && <span>🎟 {poi.admission}</span>}
        </div>
        <a
          href={`/poi/${poi.slug || toSlug(poi.name)}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: color,
            textDecoration: 'none',
          }}
        >View Details →</a>
      </div>
        </div>
      </div>
    </div>
  );
}
