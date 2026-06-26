'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import CategoryMap from '../../components/CategoryMap';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

// Per-route colors — 12 brand-extended hues, assigned by the (name-sorted)
// order routes load in, so each route's color is stable across loads and
// identical on its map line and its card. Coral, teal, and violet are the
// brand anchors; the rest walk the wheel between them.
const ROUTE_COLORS = [
  '#FF6B6B', '#F2884B', '#E3A019', '#8DA63C', '#3F9E6E', '#2FB3A8',
  '#3E9CC0', '#3E6FB0', '#6A5BAE', '#9D4EDD', '#B5468A', '#C24E6A',
];

// Placeholder "coming soon" routes — edit names/taglines anytime,
// or remove entries as they get added to the database.
const COMING_SOON = [];

// A route belongs to a state if that state is its primary state OR appears in
// its crossing_states[]. Single predicate used by both the chip roster and the
// visible-set filter, so they can never disagree.
function routeInState(route, stateName) {
  if (route.state === stateName) return true;
  return (
    Array.isArray(route.crossing_states) &&
    route.crossing_states.includes(stateName)
  );
}

export default function RoutesIndexPage() {
  const [routes, setRoutes] = useState([]);
  // States that actually have published routes (primary or crossing), in
  // states-table sort order: [{ slug, name }]. Drives the filter chips.
  const [stateOptions, setStateOptions] = useState([]);
  // null = "All". Otherwise the canonical state name (e.g. "Nevada").
  const [activeState, setActiveState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // select('*') carries crossing_states along for the belong-to-state test.
      // States roster fetched in parallel for the chips' slug/order language.
      const [{ data: routeData }, { data: stateData }] = await Promise.all([
        supabase
          .from('routes')
          .select('*')
          .eq('published', true)
          .order('name', { ascending: true }),
        supabase
          .from('states')
          .select('slug, name')
          .eq('published', true)
          .order('sort_order', { ascending: true }),
      ]);

      // Assign each route its color by name-sorted index, so the map line and
      // the card always agree. Done over the FULL set before any filtering, so
      // a route's color never shifts when a state lens is applied.
      const withColor = (routeData || []).map((r, i) => ({
        ...r,
        _color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      }));

      // Offer a chip for any state with ≥1 belonging route (primary OR
      // crossing). Today that's Utah only, so the row stays hidden; the moment
      // a Nevada route (or a UT→NV crossing) lands, the chip appears on its own.
      const options = (stateData || []).filter((s) =>
        withColor.some((r) => routeInState(r, s.name))
      );

      setRoutes(withColor);
      setStateOptions(options);

      // Honour an incoming ?state=<slug> deep-link from a hub's "drives" path.
      const params = new URLSearchParams(window.location.search);
      const wanted = (params.get('state') || '').toLowerCase();
      const match = options.find((s) => s.slug === wanted);
      setActiveState(match ? match.name : null);

      setLoading(false);
    }
    load();
  }, []);

  // SEO meta tags. Canonical stays on bare /routes — ?state= is a filter,
  // not a distinct indexable page.
  useEffect(() => {
    const title = 'Routes | Open Road Guide';
    const desc =
      'Long-form road trip guides through the American West — every stop, every story, every mile that makes the drive worth taking.';

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
    canonical.setAttribute('href', 'https://openroadguide.com/routes');
  }, []);

  // Apply a state lens. Writes the choice to the URL (shallow, no reload) so the
  // filtered view is shareable and hub deep-links round-trip cleanly.
  function applyState(option) {
    const name = option ? option.name : null;
    setActiveState(name);

    const url = new URL(window.location.href);
    if (option) url.searchParams.set('state', option.slug);
    else url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
  }

  // The visible set after the lens — primary state OR a crossing match.
  const visibleRoutes = activeState
    ? routes.filter((r) => routeInState(r, activeState))
    : routes;

  // Map data: every visible route that has a traced path_geojson line.
  const routeMapData = visibleRoutes
    .filter((r) => Array.isArray(r.path_geojson) && r.path_geojson.length > 1)
    .map((r) => ({ slug: r.slug, name: r.name, path: r.path_geojson, color: r._color }));

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>Routes</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Open Road Guide</div>
        <h1 style={styles.title}>Routes</h1>
        <p style={styles.tagline}>
          Long-form road trip guides through the American West — every stop,
          every story, every mile that makes the drive worth taking.
        </p>
      </header>

      {/* State lens — only shown once more than one state has routes */}
      {!loading && stateOptions.length > 1 && (
        <div style={styles.filterRow} role="group" aria-label="Filter routes by state">
          <FilterChip
            label="All"
            active={activeState === null}
            onClick={() => applyState(null)}
          />
          {stateOptions.map((s) => (
            <FilterChip
              key={s.slug}
              label={s.name}
              active={activeState === s.name}
              onClick={() => applyState(s)}
            />
          ))}
        </div>
      )}

      {/* Explorable map of every byway (in the current lens) */}
      {!loading && routeMapData.length > 0 && (
        <section style={styles.mapSection}>
          <CategoryMap mode="routes" routes={routeMapData} />
          <p style={styles.mapCaption}>
            Every byway on the map is a link — tap a line to open its guide.
          </p>
        </section>
      )}

      {/* Route cards */}
      {loading ? (
        <div style={styles.loading}>Loading routes…</div>
      ) : visibleRoutes.length === 0 ? (
        <div style={styles.loading}>No published routes in {activeState} yet.</div>
      ) : (
        <section style={styles.cardsGrid}>
          {/* Real routes from Supabase */}
          {visibleRoutes.map((route) => (
            <RouteCard key={route.id} route={route} color={route._color} />
          ))}

          {/* Coming soon placeholders — only in the All view (they carry no state) */}
          {activeState === null &&
            COMING_SOON.map((r, i) => (
              <ComingSoonCard key={`cs-${i}`} route={r} />
            ))}
        </section>
      )}
    </main>
  );
}

// ---- Sub-components ----

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...styles.chip,
        ...(active ? styles.chipActive : styles.chipIdle),
      }}
    >
      {label}
    </button>
  );
}

function RouteCard({ route, color }) {
  const c = color || COLORS.coral;
  const seasonsText = Array.isArray(route.best_seasons)
    ? route.best_seasons.join(' · ')
    : route.best_seasons || '';

  return (
    <Link
      href={`/route/${route.slug}`}
      style={{ ...styles.card, borderTop: `4px solid ${c}` }}
    >
      {route.state && (
        <div style={{ ...styles.cardEyebrow, color: c }}>
          {route.state} · Scenic Byway
        </div>
      )}
      <h2 style={styles.cardTitle}>{route.name}</h2>
      {route.short_description && (
        <p style={styles.cardTagline}>{route.short_description}</p>
      )}

      <div style={styles.cardStats}>
        {route.total_miles && (
          <div style={{ ...styles.cardStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.cardStatLabel}>Distance</div>
            <div style={styles.cardStatValue}>{route.total_miles} mi</div>
          </div>
        )}
        {route.estimated_drive_hours && (
          <div style={{ ...styles.cardStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.cardStatLabel}>Drive</div>
            <div style={styles.cardStatValue}>
              {route.estimated_drive_hours} hrs
            </div>
          </div>
        )}
        {seasonsText && (
          <div style={{ ...styles.cardStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.cardStatLabel}>Best</div>
            <div style={styles.cardStatValue}>{seasonsText}</div>
          </div>
        )}
        {route.difficulty && (
          <div style={{ ...styles.cardStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.cardStatLabel}>Difficulty</div>
            <div style={styles.cardStatValue}>{route.difficulty}</div>
          </div>
        )}
      </div>

      <div style={{ ...styles.cardCta, color: c }}>Plan this drive →</div>
    </Link>
  );
}

function ComingSoonCard({ route }) {
  return (
    <div style={styles.cardComingSoon}>
      <div style={styles.comingBadge}>Coming Soon</div>
      {route.state && (
        <div style={styles.cardEyebrowMuted}>{route.state} · Scenic Byway</div>
      )}
      <h2 style={styles.cardTitleMuted}>{route.name}</h2>
      {route.tagline && (
        <p style={styles.cardTaglineMuted}>{route.tagline}</p>
      )}
      <div style={styles.comingFooter}>In the works</div>
    </div>
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

  // Breadcrumb
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

  // Hero
  hero: {
    marginBottom: '3rem',
    paddingBottom: '2rem',
    borderBottom: `3px solid ${COLORS.coral}`,
    maxWidth: '46rem',
  },
  eyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.coral,
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
    margin: 0,
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
  },

  // State lens filter
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
  chipIdle: {
    background: '#fff',
    color: COLORS.warmGray,
    border: '1.5px solid #e2e2e2',
  },
  chipActive: {
    background: COLORS.ink,
    color: '#fff',
    border: `1.5px solid ${COLORS.ink}`,
  },

  // Map
  mapSection: {
    marginBottom: '3rem',
  },
  mapCaption: {
    fontSize: '0.85rem',
    color: COLORS.warmGray,
    margin: '0.75rem 0 0 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
  },

  // Cards grid
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '1.5rem',
  },

  // Real route card
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.25rem, 3vw, 1.75rem)',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    cursor: 'pointer',
    borderTop: `4px solid ${COLORS.coral}`,
  },
  cardEyebrow: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.coral,
    marginBottom: '0.5rem',
  },
  cardTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.5rem, 3.5vw, 1.85rem)',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    lineHeight: 1.15,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  cardTagline: {
    fontSize: '0.98rem',
    lineHeight: 1.55,
    color: '#444',
    margin: '0 0 1.25rem 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
    flexGrow: 1,
  },
  cardStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.6rem',
    marginBottom: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid #f0f0f0',
  },
  cardStat: {
    padding: '0.5rem 0.65rem',
    background: COLORS.paper,
    borderRadius: '8px',
    borderLeft: `3px solid ${COLORS.yellow}`,
  },
  cardStatLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.warmGray,
    marginBottom: '0.15rem',
  },
  cardStatValue: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: COLORS.ink,
  },
  cardCta: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: COLORS.coral,
    letterSpacing: '0.02em',
    marginTop: 'auto',
  },

  // Coming soon card
  cardComingSoon: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.25rem, 3vw, 1.75rem)',
    background: '#fafafa',
    border: '1px dashed #d4d4d4',
    borderRadius: '14px',
    color: 'inherit',
    position: 'relative',
    borderTop: `4px solid #d4d4d4`,
  },
  comingBadge: {
    position: 'absolute',
    top: '0.85rem',
    right: '0.85rem',
    background: COLORS.teal,
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0.35rem 0.65rem',
    borderRadius: '20px',
  },
  cardEyebrowMuted: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#999',
    marginBottom: '0.5rem',
    marginTop: '1.5rem',
  },
  cardTitleMuted: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.5rem, 3.5vw, 1.85rem)',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    lineHeight: 1.15,
    color: '#555',
    wordBreak: 'break-word',
  },
  cardTaglineMuted: {
    fontSize: '0.98rem',
    lineHeight: 1.55,
    color: '#777',
    margin: '0 0 1.25rem 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
    flexGrow: 1,
  },
  comingFooter: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 'auto',
    paddingTop: '1rem',
    borderTop: '1px solid #ececec',
  },
};
