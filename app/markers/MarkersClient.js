'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import MapView from '../../components/MapView';
import { countyHref } from '../../lib/county';

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

export default function MarkersIndexPage({ initialCounties = [], initialStateOptions = [] }) {
  // County index rows from the server: [{ state, county, count }].
  const counties0 = initialCounties;
  // [{ slug, name }] in states-table order, only states that have markers.
  const stateOptions = initialStateOptions;
  // null = "All states". Otherwise the canonical state name (e.g. "Nevada").
  const [activeState, setActiveState] = useState(null);
  // null = county index. Otherwise { state, county } — the open county view.
  const [activeCounty, setActiveCounty] = useState(null);
  const [countyMarkers, setCountyMarkers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Read-more machinery. details caches the lazily-fetched long text by id;
  // expanded tracks which cards are open; detailLoading guards in-flight fetches.
  const [details, setDetails] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [detailLoading, setDetailLoading] = useState(() => new Set());

  const totalMarkers = useMemo(() => counties0.reduce((n, c) => n + c.count, 0), [counties0]);

  // Deep links: ?state=texas and ?state=texas&county=Travis open straight to that view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = (params.get('state') || '').toLowerCase();
    const match = stateOptions.find((s) => s.slug === wanted);
    if (!match) return;
    setActiveState(match.name);
    const county = params.get('county');
    if (county && counties0.some((c) => c.state === match.name && c.county === county)) {
      openCounty(match.name, county, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function writeUrl(stateName, county) {
    const url = new URL(window.location.href);
    const opt = stateOptions.find((s) => s.name === stateName);
    if (opt) url.searchParams.set('state', opt.slug);
    else url.searchParams.delete('state');
    if (county) url.searchParams.set('county', county);
    else url.searchParams.delete('county');
    window.history.replaceState({}, '', url);
  }

  // Apply a state lens. Resets the open county (counties are state-specific).
  function applyState(option) {
    const name = option ? option.name : null;
    setActiveState(name);
    setActiveCounty(null);
    writeUrl(name, null);
  }

  async function openCounty(state, county, updateUrl = true) {
    setActiveCounty({ state, county });
    setCountyMarkers([]);
    setLoadError(false);
    setLoading(true);
    if (updateUrl) writeUrl(state, county);
    try {
      const res = await fetch(
        `/api/data?kind=marker-county&state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}`
      );
      if (!res.ok) throw new Error(String(res.status));
      const rows = await res.json();
      setCountyMarkers(Array.isArray(rows) ? rows : []);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeCounty() {
    setActiveCounty(null);
    writeUrl(activeState, null);
  }

  // Search runs in the database (all markers, not just one page of them),
  // a quarter-second after typing stops.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      let rows = [];
      try {
        const stateParam = activeState ? `&state=${encodeURIComponent(activeState)}` : '';
        const res = await fetch(`/api/data?kind=marker-search&q=${encodeURIComponent(q)}${stateParam}`);
        if (res.ok) rows = await res.json();
      } catch {
        rows = [];
      }
      if (cancelled) return;
      setSearchResults(Array.isArray(rows) ? rows : []);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, activeState]);

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
      let data = null;
      try {
        const res = await fetch(`/api/data?kind=marker&id=${encodeURIComponent(id)}`);
        if (res.ok) data = await res.json();
      } catch {
        // Falls through to empty strings below.
      }
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

  // Sort key for states, by states-table order.
  const stateOrder = useMemo(() => {
    const m = new Map();
    stateOptions.forEach((s, i) => m.set(s.name, i));
    return m;
  }, [stateOptions]);

  const counties = useMemo(() => {
    const list = activeState ? counties0.filter((c) => c.state === activeState) : counties0.slice();
    return list.sort((a, b) => {
      const so = (stateOrder.get(a.state) ?? 99) - (stateOrder.get(b.state) ?? 99);
      return so !== 0 ? so : a.county.localeCompare(b.county);
    });
  }, [counties0, activeState, stateOrder]);

  // Group the county index by state when no state is chosen, so 1,900+
  // counties read as state sections instead of one long wall.
  const countyGroups = useMemo(() => {
    const groups = [];
    let cur = null;
    for (const c of counties) {
      if (!cur || cur.state !== c.state) {
        cur = { state: c.state, total: 0, items: [] };
        groups.push(cur);
      }
      cur.items.push(c);
      cur.total += c.count;
    }
    return groups;
  }, [counties]);

  const countyMapPois = useMemo(
    () =>
      countyMarkers
        .filter((m) => m.latitude != null && m.longitude != null)
        .map((m) => ({
          id: m.id,
          name: m.name,
          longitude: m.longitude,
          latitude: m.latitude,
          category: m.theme,
          tagline: m.note || m.commemorates || null,
          href: m.has_description && m.slug ? `/marker/${m.slug}` : null,
        })),
    [countyMarkers]
  );

  const scopedTotal = activeState
    ? counties.reduce((n, c) => n + c.count, 0)
    : totalMarkers;

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" prefetch={false} style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>Historical Markers</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Open Road Guide</div>
        <h1 style={styles.title}>Historical Markers</h1>
        <p style={styles.tagline}>
          Roadside history, marker by marker: what happened here, browsable by
          state and county, or searchable by name and town.
        </p>
        {totalMarkers > 0 && (
          <div style={styles.statLine}>
            {totalMarkers.toLocaleString()} markers
            {stateOptions.length > 0 ? ` across ${stateOptions.length} state${stateOptions.length === 1 ? '' : 's'}` : ''}
          </div>
        )}
      </header>

      {/* Search */}
      <div style={styles.searchWrap}>
        <input
          type="text"
          placeholder="Search markers by name, town or county…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* State lens */}
      {stateOptions.length > 1 && (
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
      {searchResults !== null || searching ? (
        // ---- Search view ----
        <section>
          <div style={styles.resultMeta}>
            {searching
              ? 'Searching…'
              : `${searchResults.length}${searchResults.length >= 60 ? '+' : ''} ${searchResults.length === 1 ? 'marker' : 'markers'} matching “${searchQuery.trim()}”${activeState ? ` in ${activeState}` : ''}`}
          </div>
          {!searching && searchResults.length === 0 ? (
            <div style={styles.loading}>No markers match that search.</div>
          ) : (
            <div style={styles.markerList}>
              {(searchResults || []).map((m) => (
                <MarkerCard
                  key={m.id}
                  marker={m}
                  showCounty
                  showState={!activeState}
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
          <button type="button" onClick={closeCounty} style={styles.backBtn}>
            ← All counties
          </button>
          <h2 style={styles.countyHeading}>
            {countyLabel(activeCounty.county, activeCounty.state)}
            <span style={styles.countyState}> · {activeCounty.state}</span>
          </h2>
          {countyHref(activeCounty.state, activeCounty.county) && (
            <Link
              href={countyHref(activeCounty.state, activeCounty.county)}
              prefetch={false}
              style={{ ...styles.pageLink, display: 'inline-block', marginBottom: '0.75rem' }}
            >
              Open the county guide →
            </Link>
          )}
          <div style={styles.resultMeta}>
            {loading
              ? 'Loading markers…'
              : `${countyMarkers.length} ${countyMarkers.length === 1 ? 'marker' : 'markers'}`}
          </div>

          {loadError && (
            <div style={styles.loading}>These markers could not be loaded. Please try again.</div>
          )}

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
            <>
              {activeState && (
                <div style={styles.resultMeta}>
                  {scopedTotal.toLocaleString()} markers in {counties.length} {counties.length === 1 ? 'county' : 'counties'}
                </div>
              )}
              {countyGroups.map((g) => (
                <div key={g.state} style={{ marginBottom: '2rem' }}>
                  {!activeState && (
                    <h2 style={styles.groupHeading}>
                      {g.state}
                      <span style={styles.countyState}> · {g.total.toLocaleString()} markers</span>
                    </h2>
                  )}
                  <div style={styles.countyGrid}>
                    {g.items.map((c) => (
                      <button
                        key={`${c.state}|${c.county}`}
                        type="button"
                        onClick={() => openCounty(c.state, c.county)}
                        style={styles.countyCard}
                      >
                        <div style={styles.countyCardName}>{countyLabel(c.county, c.state)}</div>
                        <div style={styles.countyCardCount}>
                          {c.count} {c.count === 1 ? 'marker' : 'markers'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </main>
  );
}

// ---- Sub-components ----

// Louisiana has parishes, Alaska boroughs; "Unknown" gets no suffix, and a
// county name that already ends in County/Parish/City keeps its own word.
function countyLabel(county, state) {
  if (!county || county === 'Unknown') return 'County not recorded';
  if (/\b(county|parish|borough|city)$/i.test(county)) return county;
  return `${county} ${state === 'Louisiana' ? 'Parish' : 'County'}`;
}

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

function MarkerCard({ marker, detail, expanded, loading, onToggle, showCounty = false, showState = false }) {
  const m = marker;
  const teaser = m.note || m.commemorates || null;
  const metaBits = [
    m.marker_type,
    m.city,
    showCounty && m.county ? countyLabel(m.county, m.state) : null,
    showState ? m.state : null,
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
        {m.has_description && m.slug && (
          <Link href={`/marker/${m.slug}`} style={styles.pageLink}>
            Full story →
          </Link>
        )}
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
  countyState: { color: COLORS.warmGray, fontWeight: 400, fontSize: '0.7em' },
  groupHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
    fontWeight: 600,
    margin: '0 0 0.9rem 0',
    color: COLORS.ink,
  },
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
  pageLink: {
    color: COLORS.coral,
    fontWeight: 600,
    fontSize: '0.9rem',
    textDecoration: 'none',
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
