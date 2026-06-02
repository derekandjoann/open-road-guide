'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

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

export default function RegionsIndexPage() {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('regions')
        .select('*, region_pois(count)')
        .eq('published', true)
        .order('name', { ascending: true });

      setRegions(data || []);
      setLoading(false);
    }
    load();
  }, []);

  // SEO meta tags
  useEffect(() => {
    const title = 'Regions | Open Road Guide';
    const desc =
      'Explore the American West by region — each one gathers the parks, towns, drives, and roadside stops that define a single corner of the map.';

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
    canonical.setAttribute('href', 'https://openroadguide.com/regions');
  }, []);

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

      {/* Region cards */}
      {loading ? (
        <div style={styles.loading}>Loading regions…</div>
      ) : regions.length === 0 ? (
        <div style={styles.loading}>Regions are on the way.</div>
      ) : (
        <section style={styles.cardsGrid}>
          {regions.map((region) => (
            <RegionCard key={region.id} region={region} />
          ))}
        </section>
      )}
    </main>
  );
}

// ---- Sub-components ----

function RegionCard({ region }) {
  const placeCount =
    Array.isArray(region.region_pois) && region.region_pois[0]
      ? region.region_pois[0].count
      : 0;

  return (
    <Link href={`/region/${region.slug}`} style={styles.card}>
      {region.state && (
        <div style={styles.cardEyebrow}>{region.state} · Region</div>
      )}
      <h2 style={styles.cardTitle}>{region.name}</h2>
      {region.short_description && (
        <p style={styles.cardTagline}>{region.short_description}</p>
      )}
      {placeCount > 0 && (
        <div style={styles.cardCount}>
          {placeCount} {placeCount === 1 ? 'place' : 'places'} to explore
        </div>
      )}
      <div style={styles.cardCta}>Explore region →</div>
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
