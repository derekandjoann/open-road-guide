'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/MapView';
import { getCategoryColor, getCategoryEmoji } from '../../lib/categoryColors';
import { toSlug } from '../../lib/slug'; 
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
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

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

  // Scroll to selected POI
  useEffect(() => {
    if (selectedPoi && listRef.current) {
      const el = listRef.current.querySelector(`[data-poi-id="${selectedPoi.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedPoi]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f7f4',
      fontFamily: "'Outfit', sans-serif",
    }}>
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

      {/* Map + Sidebar */}
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 130px)',
      }}>
        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
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
            width: '360px',
            overflowY: 'auto',
            background: '#fff',
            borderLeft: '1px solid #e8e6e1',
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
function PoiCard({ poi, isSelected, onClick }) {
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
      }}
    >
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
  );
}
