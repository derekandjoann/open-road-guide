'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/MapView';

// Open Road Guide brand palette
const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  paper: '#FFF8F0',
  warmGray: '#666',
};

const MARKER_VIOLET = '#9D4EDD';

export default function MarkersIndexPage() {
  // Light marker set (no description/inscription text — those load on demand).
  const [markers, setMarkers] = useState([]);
  // [{ slug, name }] in states-table order, intersected with states that have
  // markers — drives the state lens, same slug language as the rest of the site.
  const [stateOptions, setStateOptions] = useState([]);
  // null = "All states". Otherwise the canonical state name (e.g. "Nevada").
  const [activeState, setActiveState] = useState(null);
  // null = county index. Otherwise { state, county } — the open county view.
  const [activeCounty, setActiveCounty] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Read-more machinery. details caches the lazily-fetched long text by id;
  // expanded tracks which cards are open; detailLoading guards in-flight fetches.
  const [details, setDetails] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [detailLoading, setDetailLoading] = useState(() => new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      // One overlay call returns every marker tagged with its state, plus the
      // lightweight has_description / has_inscription flags. The states roster
      // gives the lens chips their slug/order.
      const [overlayRes, stateRes] = await Promise.all([
        supabase.rpc('markers_overlay'),
        supabase
          .from('states')
          .select('slug, name')
          .eq('published', true)
          .order('sort_order', { ascending: true }),
      ]);

      const features = overlayRes?.data?.features || [];
      const rows = features.map((f) => {
        const [lng, lat] = f.geometry?.coordinates || [];
        const p = f.properties || {};
        return {
          id: p.id,
          name: p.name,
          longitude: lng,
          latitude: lat,
          state: p.state,
          county: p.county || 'Unknown',
          city: p.city,
          theme: p.theme,
          commemorates: p.commemorates,
          marker_type: p.marker_type,
          year: p.year,
          erected_by: p.erected_by,
          note: p.note,
          hmdb_url: p.hmdb_url,
          has_description: !!p.has_description,
          has_inscription: !!p.has_inscription,
        };
      });

      const present = new Set(rows.map((m) => m.state).filter(Boolean));
      const options = (stateRes.data || []).filter((s) => present.has(s.name));

      setMarkers(rows);
      setStateOptions(options);

      // Honour an incoming ?state=<slug> deep-link (from a hub or listing).
      const wanted = (new URLSearchParams(window.location.search).get('state') || '').toLowerCase();
      const match = options.find((s) => s.slug === wanted);
      if (match) setActiveState(match.name);

      setLoading(false);
    }
    load();
  }, []);

  // SEO meta tags. Canonical stays on bare /markers — ?state= is a filter.
  useEffect(() => {
    const title = 'Historical Markers | Open Road Guide';
    const desc =
      'Every roadside historical marker across the American West, browsable by state and county — the plaques and monuments where the region remembers itself.';
    document.title = title;
    const setMeta = (selector, attr, value) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const m = selector.match(/\[(\w+)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:type"]', 'content', 'website');
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://openroadguide.com/markers');
  }, []);

  // Apply a state lens. Resets the open county (counties are state-specific) and
  // writes ?state to the URL so the view is shareable and deep-links round-trip.
  function applyState(option) {
    const name = option ? option.name : null;
    setActiveState(name);
    setActiveCounty(null);
    const url = new URL(window.location.href);
    if (option) url.searchParams.set('state', option.slug);
    else url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
  }

  // Toggle a card's read-more, lazily fetching the long text the first time.
  async function toggleExpand(id) {
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    if (!details[id] && !detailLoading.has(id)) {
      setDetailLoading((prev) => new Set(prev).add(id));
      const { data } = await supabase
        .from('markers')
        .select('description, inscription')
        .eq('id', id)
        .maybeSingle();
      setDetails((prev) => ({
        ...prev,
        [id]: {
          description: data?.description || '',
          inscription: data?.inscription || '',
        },
      }));
      setDetailLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setExpanded((prev) => new Set(prev).add(id));
  }

  // Sort key for states, by states-table order (Utah before Nevada, etc.).
  const stateOrder = useMemo(() => {
    const m = new Map();
    stateOptions.forEach((s, i) => m.set(s.name, i));
    return m;
  }, [stateOptions]);

  const scopedMarkers = useMemo(
    () => (activeState ? markers.filter((m) => m.state === activeState) : markers),
    [markers, activeState]
  );

  // County index: one entry per (state, county), with a count.
  const counties = useMemo(() => {
    const map = new Map();
    for (const m of scopedMarkers) {
      const key = `${m.state}|${m.county}`;
      if (!map.has(key)) map.set(key, { state: m.state, county: m.county, count: 0 });
      map.get(key).count += 1;
    }
    return [...map.values()].sort((a, b) => {
      const so = (stateOrder.get(a.state) ?? 99) - (stateOrder.get(b.state) ?? 99);
      return so !== 0 ? so : a.county.localeCompare(b.county);
    });
  }, [scopedMarkers, stateOrder]);

  const countyMarkers = useMemo(() => {
    if (!activeCounty) return [];
    return markers
      .filter((m) => m.state === activeCounty.state && m.county === activeCounty.county)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [markers, activeCounty]);

  // Map points for the county view — markers ride in as POIs so MapView frames
  // and renders them; markerColor forces the violet historical-marker hue.
  const countyMapPois = useMemo(
    () =>
      countyMarkers.map((m) => ({
        id: m.id,
        name: m.name,
        longitude: m.longitude,
        latitude: m.latitude,
        category: m.theme,
        tagline: m.note || m.commemorates || null,
      })),
    [countyMarkers]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return scopedMarkers
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.county && m.county.toLowerCase().includes(q)) ||
          (m.theme && m.theme.toLowerCase().includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, scopedMarkers]);

  const showStateTag = activeState === null;

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>Historical Markers</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Open Road Guide</div>
        <h1 style={styles.title}>Historical Markers</h1>
        <p style={styles.tagline}>
          Roadside history, marker by marker — the plaques and monuments where the
          West records what happened here, browsable by state and county.
        </p>
        {!loading && markers.length > 0 && (
          <div style={styles.statLine}>
            {markers.length.toLocaleString()} markers
            {stateOptions.length > 0 ? ` across ${stateOptions.length} state${stateOptions.length === 1 ? '' : 's'}` : ''}
          </div>
        )}
      </header>

      {/* Search */}
      <div style={styles.searchWrap}>
        <input
          type="text"
          placeholder="Search markers by name, county, or theme…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* State lens */}
      {!loading && stateOptions.length > 1 && (
        <div style={styles.filterRow} role="group" aria-label="Filter markers by state">
          <StateChip label="All" active={activeState === null} onClick={() => applyState(null)} />
          {stateOptions.map((s) => (
            <StateChip
              key={s.slug}
              label={s.name}
              active={activeState === s.name}
              onClick={() => applyState(s)}
            />
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={styles.loading}>Loading markers…</div>
      ) : searchResults !== null ? (
        // ---- Search view ----
        <section>
          <div style={styles.resultMeta}>
            {searchResults.length} {searchResults.length === 1 ? 'marker' : 'markers'} matching
            {' '}&ldquo;{searchQuery.trim()}&rdquo;
          </div>
          {searchResults.length === 0 ? (
            <div style={styles.loading}>No markers match that search.</div>
          ) : (
            <div style={styles.markerList}>
              {searchResults.map((m) => (
                <MarkerCard
                  key={m.id}
                  marker={m}
                  showCounty
                  expanded={expanded.has(m.id)}
                  loading={detailLoading.has(m.id)}
                  detail={details[m.id]}
                  onToggle={() => toggleExpand(m.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : activeCounty ? (
        // ---- County view ----
        <section>
          <button type="button" onClick={() => setActiveCounty(null)} style={styles.backBtn}>
            ← All counties
          </button>
          <h2 style={styles.countyHeading}>
            {activeCounty.county} County
            <span style={styles.countyState}> · {activeCounty.state}</span>
          </h2>
          <div style={styles.resultMeta}>
            {countyMarkers.length} {countyMarkers.length === 1 ? 'marker' : 'markers'}
          </div>

          {countyMapPois.length > 0 && (
            <div style={styles.mapSection}>
              <MapView pois={countyMapPois} markerColor={MARKER_VIOLET} height="460px" />
            </div>
          )}

          <div style={styles.markerList}>
            {countyMarkers.map((m) => (
              <MarkerCard
                key={m.id}
                marker={m}
                expanded={expanded.has(m.id)}
                loading={detailLoading.has(m.id)}
                detail={details[m.id]}
                onToggle={() => toggleExpand(m.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        // ---- County index ----
        <section>
          {counties.length === 0 ? (
            <div style={styles.loading}>No markers here yet.</div>
          ) : (
            <div style={styles.countyGrid}>
              {counties.map((c) => (
                <button
                  key={`${c.state}|${c.county}`}
                  type="button"
                  onClick={() => setActiveCounty({ state: c.state, county: c.county })}
                  style={styles.countyCard}
                >
                  {showStateTag && <div style={styles.countyCardState}>{c.state}</div>}
                  <div style={styles.countyCardName}>{c.county} County</div>
                  <div style={styles.countyCardCount}>
                    {c.count} {c.count === 1 ? 'marker' : 'markers'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ---- Sub-components ----

function StateChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ ...styles.chip, ...(active ? styles.chipActive : styles.chipIdle) }}
    >
      {label}
    </button>
  );
}

function MarkerCard({ marker, detail, expanded, loading, onToggle, showCounty = false }) {
  const m = marker;
  const teaser = m.note || m.commemorates || null;
  const metaBits = [
    m.marker_type,
    m.city,
    showCounty ? `${m.county} County` : null,
    m.year,
  ].filter(Boolean);
  const canExpand = m.has_description || m.has_inscription;

  return (
    <article style={styles.markerCard}>
      <div style={styles.markerEyebrow}>{m.theme || 'Historical Marker'}</div>
      <h3 style={styles.markerName}>{m.name}</h3>

      {metaBits.length > 0 && (
        <div style={styles.markerMeta}>{metaBits.join(' · ')}</div>
      )}

      {teaser && <p style={styles.markerTeaser}>{teaser}</p>}

      {expanded && detail && (
        <div style={styles.expandBody}>
          {detail.description
            ? detail.description.split(/\n\n+/).map((para, i) => (
                <p key={i} style={styles.expandPara}>{para}</p>
              ))
            : null}
          {detail.inscription && (
            <blockquote style={styles.inscription}>
              <div style={styles.inscriptionLabel}>Inscription</div>
              {detail.inscription}
            </blockquote>
          )}
        </div>
      )}

      <div style={styles.markerFooter}>
        {canExpand && (
          <button type="button" onClick={onToggle} style={styles.readMore}>
            {loading ? 'Loading…' : expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        {m.hmdb_url && (
          <a
            href={m.hmdb_url}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.hmdbLink}
          >
            View on HMdb ↗
          </a>
        )}
      </div>
    </article>
  );
}

// ---- Styles ----

const styles = {
  main: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: 'clamp(1rem, 4vw, 2.5rem)',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.ink,
  },
  loading: {
    textAlign: 'center',
    padding: '4rem 1rem',
    fontSize: '1.1rem',
    color: COLORS.warmGray,
  },

  breadcrumb: {
    fontSize: '0.9rem',
    color: COLORS.warmGray,
    marginBottom: '1.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
  },
  crumbLink: { color: COLORS.warmGray, textDecoration: 'none' },
  crumbSep: { color: '#bbb' },
  crumbCurrent: { color: COLORS.ink, fontWeight: 500 },

  hero: {
    marginBottom: '2rem',
    paddingBottom: '2rem',
    borderBottom: `3px solid ${COLORS.violet}`,
    maxWidth: '48rem',
  },
  eyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.violet,
    marginBottom: '0.75rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    lineHeight: 1.05,
    color: COLORS.ink,
  },
  tagline: {
    fontSize: 'clamp(1.05rem, 2.2vw, 1.3rem)',
    lineHeight: 1.55,
    color: '#3a3a4e',
    margin: '0 0 1rem 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
  },
  statLine: {
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.warmGray,
  },

  searchWrap: { marginBottom: '1.25rem' },
  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.85rem 1.1rem',
    borderRadius: '12px',
    border: '1.5px solid #e2e2e2',
    background: '#fff',
    color: COLORS.ink,
    fontSize: '1rem',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    outline: 'none',
  },

  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
    marginBottom: '2rem',
    alignItems: 'center',
  },
  chip: {
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '0.9rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '0.5rem 1.1rem',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    lineHeight: 1.2,
  },
  chipIdle: { background: '#fff', color: COLORS.warmGray, border: '1.5px solid #e2e2e2' },
  chipActive: { background: COLORS.ink, color: '#fff', border: `1.5px solid ${COLORS.ink}` },

  // County index
  countyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
    gap: '1rem',
  },
  countyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
    padding: '1.1rem 1.25rem',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    borderTop: `4px solid ${COLORS.violet}`,
    cursor: 'pointer',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  countyCardState: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.violet,
    marginBottom: '0.35rem',
  },
  countyCardName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.3rem',
    fontWeight: 600,
    color: COLORS.ink,
    lineHeight: 1.15,
    marginBottom: '0.4rem',
  },
  countyCardCount: { fontSize: '0.85rem', color: COLORS.warmGray, fontWeight: 500 },

  // County view
  backBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: COLORS.violet,
    fontWeight: 600,
    fontSize: '0.95rem',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    marginBottom: '1rem',
  },
  countyHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.6rem, 5vw, 2.4rem)',
    fontWeight: 600,
    margin: '0 0 0.3rem 0',
    color: COLORS.ink,
  },
  countyState: { color: COLORS.warmGray, fontWeight: 400 },
  resultMeta: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: COLORS.warmGray,
    marginBottom: '1.5rem',
  },
  mapSection: { marginBottom: '2rem' },

  // Marker cards
  markerList: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  markerCard: {
    padding: 'clamp(1.1rem, 3vw, 1.5rem)',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    borderLeft: `4px solid ${COLORS.violet}`,
  },
  markerEyebrow: {
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.violet,
    marginBottom: '0.4rem',
  },
  markerName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.3rem, 3.5vw, 1.6rem)',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    lineHeight: 1.2,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  markerMeta: {
    fontSize: '0.85rem',
    color: COLORS.warmGray,
    marginBottom: '0.75rem',
  },
  markerTeaser: {
    fontSize: '1rem',
    lineHeight: 1.6,
    color: '#3a3a4e',
    margin: '0 0 0.5rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
  },
  expandBody: {
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #f0f0f0',
  },
  expandPara: {
    fontSize: '1rem',
    lineHeight: 1.7,
    color: '#2a2a3e',
    margin: '0 0 1rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
  },
  inscription: {
    margin: '1rem 0 0 0',
    padding: '0.75rem 1rem',
    background: COLORS.paper,
    borderLeft: `3px solid ${COLORS.yellow}`,
    borderRadius: '0 8px 8px 0',
    fontFamily: "'Fraunces', Georgia, serif",
    fontStyle: 'italic',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    color: '#3a3a4e',
    whiteSpace: 'pre-line',
  },
  inscriptionLabel: {
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.warmGray,
    marginBottom: '0.4rem',
    fontStyle: 'normal',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  markerFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    alignItems: 'center',
    marginTop: '0.85rem',
  },
  readMore: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: COLORS.violet,
    fontWeight: 600,
    fontSize: '0.9rem',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  hmdbLink: {
    color: COLORS.warmGray,
    fontWeight: 600,
    fontSize: '0.85rem',
    textDecoration: 'none',
  },
};
