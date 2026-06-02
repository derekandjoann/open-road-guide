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

// Placeholder "coming soon" routes — edit names/taglines anytime,
// or remove entries as they get added to the database.
const COMING_SOON = [];

export default function RoutesIndexPage() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('routes')
        .select('*')
        .eq('published', true)
        .order('name', { ascending: true });

      setRoutes(data || []);
      setLoading(false);
    }
    load();
  }, []);

  // SEO meta tags
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

      {/* Route cards */}
      {loading ? (
        <div style={styles.loading}>Loading routes…</div>
      ) : (
        <section style={styles.cardsGrid}>
          {/* Real routes from Supabase */}
          {routes.map((route) => (
            <RouteCard key={route.id} route={route} />
          ))}

          {/* Coming soon placeholders */}
          {COMING_SOON.map((r, i) => (
            <ComingSoonCard key={`cs-${i}`} route={r} />
          ))}
        </section>
      )}
    </main>
  );
}

// ---- Sub-components ----

function RouteCard({ route }) {
  const seasonsText = Array.isArray(route.best_seasons)
    ? route.best_seasons.join(' · ')
    : route.best_seasons || '';

  return (
    <Link href={`/route/${route.slug}`} style={styles.card}>
      {route.state && (
        <div style={styles.cardEyebrow}>{route.state} · Scenic Byway</div>
      )}
      <h2 style={styles.cardTitle}>{route.name}</h2>
      {route.short_description && (
        <p style={styles.cardTagline}>{route.short_description}</p>
      )}

      <div style={styles.cardStats}>
        {route.total_miles && (
          <div style={styles.cardStat}>
            <div style={styles.cardStatLabel}>Distance</div>
            <div style={styles.cardStatValue}>{route.total_miles} mi</div>
          </div>
        )}
        {route.estimated_drive_hours && (
          <div style={styles.cardStat}>
            <div style={styles.cardStatLabel}>Drive</div>
            <div style={styles.cardStatValue}>
              {route.estimated_drive_hours} hrs
            </div>
          </div>
        )}
        {seasonsText && (
          <div style={styles.cardStat}>
            <div style={styles.cardStatLabel}>Best</div>
            <div style={styles.cardStatValue}>{seasonsText}</div>
          </div>
        )}
        {route.difficulty && (
          <div style={styles.cardStat}>
            <div style={styles.cardStatLabel}>Difficulty</div>
            <div style={styles.cardStatValue}>{route.difficulty}</div>
          </div>
        )}
      </div>

      <div style={styles.cardCta}>Plan this drive →</div>
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
