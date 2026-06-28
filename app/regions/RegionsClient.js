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

// Per-region colors — 14 hues, assigned by the (name-sorted) order regions
// load in, so each region's color is stable and matches its map piece exactly.
const REGION_COLORS = [
  '#C1432E', '#D9772B', '#C99A2E', '#7E8A2E', '#4F8F4A', '#2E9E83', '#3E9CC0',
  '#3E6FB0', '#6A5BAE', '#8E4FA0', '#B5468A', '#C24E6A', '#7C6A55', '#5B8C7B',
];

export default function RegionsIndexPage({ initialRegions = [], initialStateOptions = [] }) {
  const [regions, setRegions] = useState(initialRegions);
  // States that actually have published regions, in states-table sort order:
  // [{ slug, name }]. Drives the filter chips; self-maintaining as states grow.
  const [stateOptions, setStateOptions] = useState(initialStateOptions);
  // null = "All". Otherwise the canonical state name (e.g. "Nevada").
  const [activeState, setActiveState] = useState(null);
  const [loading, setLoading] = useState(false);

  // Data is seeded from the server render (see page.js); only the ?state=
  // deep-link needs the browser. Match it against the seeded roster once.
  useEffect(() => {
    const wanted = (new URLSearchParams(window.location.search).get('state') || '').toLowerCase();
    const match = stateOptions.find((s) => s.slug === wanted);
    if (match) setActiveState(match.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The visible set after the lens. Map + cards both read from this; colors are
  // already baked in above, so filtering never re-hues a region.
  const visibleRegions = activeState
    ? regions.filter((r) => r.state === activeState)
    : regions;

  // Map data: each region's POI coordinates become a colored footprint.
  // Needs at least three geocoded points to form an area.
  const regionMapData = visibleRegions
    .map((region) => ({
      slug: region.slug,
      name: region.name,
      color: region._color,
      points: (region.region_pois || [])
        .map((rp) => rp.pois)
        .filter(
          (p) =>
            p &&
            typeof p.longitude === 'number' &&
            typeof p.latitude === 'number'
        )
        .map((p) => [p.longitude, p.latitude]),
    }))
    .filter((r) => r.points.length >= 3);

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>Regions</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Open Road Guide</div>
        <h1 style={styles.title}>Regions</h1>
        <p style={styles.tagline}>
          The American West, organized by place — each region gathers the parks,
          towns, drives, and roadside stops that define one corner of the map.
        </p>
      </header>

      {/* State lens — only shown once more than one state has regions */}
      {!loading && stateOptions.length > 1 && (
        <div style={styles.filterRow} role="group" aria-label="Filter regions by state">
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

      {/* Explorable map of every region (in the current lens) */}
      {!loading && regionMapData.length > 0 && (
        <section style={styles.mapSection}>
          <CategoryMap mode="regions" regions={regionMapData} />
          <p style={styles.mapCaption}>
            Each colored area marks where a region sits — tap one to explore it.
          </p>
        </section>
      )}

      {/* Region cards */}
      {loading ? (
        <div style={styles.loading}>Loading regions…</div>
      ) : visibleRegions.length === 0 ? (
        <div style={styles.loading}>
          {activeState
            ? `No published regions in ${activeState} yet.`
            : 'Regions are on the way.'}
        </div>
      ) : (
        <section style={styles.cardsGrid}>
          {visibleRegions.map((region) => (
            <RegionCard key={region.id} region={region} color={region._color} />
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

function RegionCard({ region, color }) {
  const c = color || COLORS.violet;
  const placeCount = Array.isArray(region.region_pois)
    ? region.region_pois.length
    : 0;

  return (
    <Link
      href={`/region/${region.slug}`}
      style={{ ...styles.card, borderTop: `4px solid ${c}` }}
    >
      {region.state && (
        <div style={{ ...styles.cardEyebrow, color: c }}>
          {region.state} · Region
        </div>
      )}
      <h2 style={styles.cardTitle}>{region.name}</h2>
      {region.short_description && (
        <p style={styles.cardTagline}>{region.short_description}</p>
      )}
      {placeCount > 0 && (
        <div style={{ ...styles.cardCount, background: c, color: '#fff' }}>
          {placeCount} {placeCount === 1 ? 'place' : 'places'} to explore
        </div>
      )}
      <div style={{ ...styles.cardCta, color: c }}>Explore region →</div>
    </Link>
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

  // Region card
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.25rem, 3vw, 1.75rem)',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    textDecoration: 'none',
    color: 'inherit',
    transition:
      'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    cursor: 'pointer',
    borderTop: `4px solid ${COLORS.violet}`,
  },
  cardEyebrow: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.violet,
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
  cardCount: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.ink,
    background: COLORS.yellow,
    padding: '0.35rem 0.75rem',
    borderRadius: '999px',
    marginBottom: '1.25rem',
  },
  cardCta: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: COLORS.violet,
    letterSpacing: '0.02em',
    marginTop: 'auto',
  },
};
