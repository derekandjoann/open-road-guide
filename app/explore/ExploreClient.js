'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/MapView';
import { getCategoryColor, getCategoryEmoji } from '../../lib/categoryColors';
import { navLinks, isNavLinkActive } from '../../lib/navLinks';
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

// Desktop consolidated-header tab styles. On /explore the section nav lives in
// the dark bar (Nav.js returns null there at desktop width), so these mirror the
// dark global nav's tab treatment: light inactive, coral active with underline.
const navTabInactive = {
  color: 'rgba(255,255,255,0.72)',
  textDecoration: 'none',
  fontSize: '15px',
  fontWeight: 500,
  paddingBottom: '4px',
  borderBottom: '2px solid transparent',
};
const navTabActive = {
  color: '#ff6b5b',
  textDecoration: 'none',
  fontSize: '15px',
  fontWeight: 600,
  paddingBottom: '4px',
  borderBottom: '2px solid #ff6b5b',
};

export default function ExplorePage({ initialPois = [], initialStateOptions = [] }) {
  const pathname = usePathname();
  const [pois, setPois] = useState(initialPois);
  const [filteredPois, setFilteredPois] = useState(initialPois);
  const [activeCategory, setActiveCategory] = useState('All');
  // State lens. null = "All states". activeState holds the canonical state name
  // (e.g. "Nevada"); stateOptions is the chip roster [{slug,name}] in
  // states-table order, intersected with the states that actually have POIs.
  const [activeState, setActiveState] = useState(null);
  const [stateOptions, setStateOptions] = useState(initialStateOptions);
  const [searchQuery, setSearchQuery] = useState('');
  // Ranked results from the search_pois() full-text RPC. null = RPC inactive
  // (query empty/too short, still in flight, or errored) — in that case the
  // legacy substring filter below applies, so search never breaks.
  const [searchResults, setSearchResults] = useState(null);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [loading, setLoading] = useState(false);
  // Mobile layout switch: stack map over list below 768px. matchMedia with a
  // change listener keeps it correct through rotation; initial false avoids
  // SSR/window access issues since this only renders meaningfully client-side.
  const [isMobile, setIsMobile] = useState(false);
  // Measured height of the sticky search+chips controls pane on mobile. Feeds
  // the map's sticky `top` and the cards' scroll-margin so the map pins right
  // below the controls and a tapped card clears the whole stack. 0 on desktop.
  const [controlsH, setControlsH] = useState(0);
  // Mobile category dropdown (the hamburger beside the search). Desktop keeps
  // its always-on chip strip and never opens this.
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      setFiltersOpen(false);
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

  // Fetch POIs + the states roster (in parallel). The states table gives the
  // lens chips their slug/order language — the same one the hub, nav, sitemap,
  // and the /regions · /stories · /routes listings all speak.
  // POIs + states are seeded from the server render (see page.js). The list
  // and category chips are derived from those, so they paint on first load;
  // only the ?state= deep-link needs the browser. Apply it once on mount.
  useEffect(() => {
    const wanted = (new URLSearchParams(window.location.search).get('state') || '').toLowerCase();
    const match = stateOptions.find((s) => s.slug === wanted);
    if (match) setActiveState(match.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (activeState !== null) {
      result = result.filter(p => p.state === activeState);
    }
    if (activeCategory !== 'All') {
      result = result.filter(p => p.category === activeCategory);
    }
    setFilteredPois(result);
  }, [activeCategory, activeState, searchQuery, searchResults, pois]);

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

  // The state-scoped base set drives the category chip roster AND its counts,
  // so the categories (and their numbers) always reflect the chosen state
  // rather than the all-states totals.
  const scopedPois = useMemo(
    () => (activeState ? pois.filter(p => p.state === activeState) : pois),
    [pois, activeState]
  );
  const categories = useMemo(
    () => [...new Set(scopedPois.map(p => p.category).filter(Boolean))].sort(),
    [scopedPois]
  );

  // Apply a state lens. Resets a category that no longer exists under the new
  // state, and writes ?state to the URL (shallow, no reload) so the view is
  // shareable and hub deep-links round-trip cleanly.
  function applyState(option) {
    const name = option ? option.name : null;
    setActiveState(name);

    const base = name ? pois.filter(p => p.state === name) : pois;
    const cats = new Set(base.map(p => p.category).filter(Boolean));
    if (activeCategory !== 'All' && !cats.has(activeCategory)) {
      setActiveCategory('All');
    }

    const url = new URL(window.location.href);
    if (option) url.searchParams.set('state', option.slug);
    else url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f7f4',
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Search + category controls. On mobile this whole block is sticky,
          pinned under the global nav (top:94px) so the search field and the
          filter chips stay on screen while the card list scrolls beneath the
          map. Its measured height (controlsH) drives the map's sticky top and
          the cards' scroll-margin below. On desktop the wrapper is static; the
          consolidated header inside it pins itself (sticky top:0). */}
      <div
        ref={controlsRef}
        style={{
          position: isMobile ? 'sticky' : 'static',
          top: isMobile ? '94px' : 'auto',
          zIndex: isMobile ? 40 : 'auto',
        }}
      >
      {/* Header. Mobile is unchanged — search + hamburger + the category
          dropdown, the dark band the phone already ships. Desktop renders the
          consolidated bar instead: on /explore the global nav steps aside
          (Nav.js returns null at desktop width) and this single dark row carries
          the wordmark, the section tabs, and the search. The old branding row
          and the separate cream nav are both gone. */}
      <header style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: isMobile ? '12px 16px' : '15px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : 'flex-start',
        flexWrap: 'nowrap',
        gap: isMobile ? '10px' : '34px',
        // Mobile: relative — anchors the dropdown; the sticky controls wrapper
        // pins it under the cream nav. Desktop: this bar is the page's top
        // chrome (no global nav on /explore), so it pins itself at the top.
        position: isMobile ? 'relative' : 'sticky',
        top: isMobile ? 'auto' : 0,
        zIndex: isMobile ? 'auto' : 100,
      }}>
        {isMobile ? (
          <>
            <div style={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
              // Keep the field above the dropdown's tap-away backdrop so it
              // stays focusable while the menu is open.
              zIndex: 3,
            }}>
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

            {/* Hamburger. Tints coral when a filter other than "All" is active,
                so a hidden filter is never forgotten. */}
            <button
              type="button"
              onClick={() => setFiltersOpen(o => !o)}
              aria-label="Filter by category"
              aria-expanded={filtersOpen}
              style={{
                position: 'relative',
                zIndex: 3,
                flexShrink: 0,
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                background: (activeCategory !== 'All' || activeState !== null) ? '#ff6b5b' : 'rgba(255,255,255,0.1)',
              }}
            >
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: '18px',
                  height: '2px',
                  borderRadius: '2px',
                  background: '#fff',
                  opacity: (activeCategory !== 'All' || activeState !== null) ? 1 : 0.85,
                }} />
              ))}
            </button>

            {/* Category dropdown. A fixed backdrop closes it on an outside tap;
                each chip filters and closes. It sits inside the sticky controls
                wrapper (z-index 40), so it paints above the map (z-index 20).
                Field and hamburger are at z-index 3 so they stay live above the
                z-index-1 backdrop while the z-index-2 panel floats over the map. */}
            {filtersOpen && (
              <>
                <div
                  onClick={() => setFiltersOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.04)',
                    zIndex: 1,
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '16px',
                  right: '16px',
                  background: '#fff',
                  borderRadius: '14px',
                  padding: '14px',
                  boxShadow: '0 14px 36px rgba(0,0,0,0.28)',
                  zIndex: 2,
                }}>
                  {stateOptions.length > 1 && (
                    <>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: '#999',
                        marginBottom: '11px',
                      }}>Filter by state</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
                        <StateChip
                          label="All"
                          active={activeState === null}
                          onClick={() => applyState(null)}
                        />
                        {stateOptions.map(s => (
                          <StateChip
                            key={s.slug}
                            label={s.name}
                            active={activeState === s.name}
                            onClick={() => applyState(s)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: '#999',
                    marginBottom: '11px',
                  }}>Filter by category</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <FilterChip
                      label="All"
                      count={scopedPois.length}
                      active={activeCategory === 'All'}
                      color="#1a1a2e"
                      onClick={() => { setActiveCategory('All'); setFiltersOpen(false); }}
                    />
                    {categories.map(cat => {
                      const color = getCategoryColor(cat);
                      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                      return (
                        <FilterChip
                          key={cat}
                          label={label}
                          count={scopedPois.filter(p => p.category === cat).length}
                          active={activeCategory === cat}
                          color={color}
                          onClick={() => { setActiveCategory(cat); setFiltersOpen(false); }}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {/* Wordmark — links home, like the old nav. */}
            <Link href="/" style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '21px',
              fontWeight: 800,
              color: '#ff6b5b',
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              flex: '0 0 auto',
            }}>Open Road Guide</Link>

            {/* Section tabs. Explore is the current page; the others link out and
                match the dark nav the rest of the site now renders. */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '28px', flex: '0 0 auto' }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={isNavLinkActive(pathname, link.href) ? navTabActive : navTabInactive}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Spacer pushes the search to the right edge. */}
            <div style={{ flex: 1 }} />

            {/* Search — the same field as before, now in the single bar. */}
            <div style={{ position: 'relative', width: '280px', maxWidth: '100%', flex: '0 0 auto' }}>
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
          </>
        )}
      </header>

      {/* Category Filters — desktop only. On mobile these live in the
          hamburger dropdown above, so the strip is removed to reclaim height. */}
      {!isMobile && (
      <div style={{
        padding: '12px 28px',
        background: '#fff',
        borderBottom: '1px solid #e8e6e1',
        overflowX: 'auto',
        display: 'flex',
        gap: '8px',
        whiteSpace: 'nowrap',
        alignItems: 'center',
      }}>
        {stateOptions.length > 1 && (
          <>
            <StateChip
              label="All"
              active={activeState === null}
              onClick={() => applyState(null)}
            />
            {stateOptions.map(s => (
              <StateChip
                key={s.slug}
                label={s.name}
                active={activeState === s.name}
                onClick={() => applyState(s)}
              />
            ))}
            <div style={{
              width: '1px',
              alignSelf: 'stretch',
              background: '#e2e0db',
              margin: '2px 8px',
              flexShrink: 0,
            }} />
          </>
        )}
        <FilterChip
          label="All"
          count={scopedPois.length}
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
              count={scopedPois.filter(p => p.category === cat).length}
              active={activeCategory === cat}
              color={color}
              onClick={() => setActiveCategory(cat)}
            />
          );
        })}
      </div>
      )}
      </div>
      {/* end sticky controls wrapper */}

      {/* Map + Sidebar — side-by-side on desktop, stacked on mobile */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        height: isMobile ? 'auto' : 'calc(100vh - 124px)',
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
            {activeState ? ` · ${activeState}` : ''}
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

/* State Lens Chip — filled-ink pill, no color dot, so it reads as a different
   (coarser) control than the dotted category chips it sits beside. */
function StateChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '7px 14px',
        borderRadius: '20px',
        border: active ? '2px solid #1a1a2e' : '2px solid transparent',
        background: active ? '#1a1a2e' : '#f5f4f1',
        color: active ? '#fff' : '#666',
        cursor: 'pointer',
        fontFamily: "'Outfit', sans-serif",
        fontSize: '13px',
        fontWeight: active ? 700 : 500,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      {label}
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
