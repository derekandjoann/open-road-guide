'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const toSlug = (s) =>
  s
    ?.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || '';

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

// How POI categories are labeled and ordered on a region page
const CATEGORY_LABELS = {
  geological: 'Geology & Rock Formations',
  natural: 'Natural Areas',
  recreational: 'Hikes & Trails',
  historical: 'Historic Sites',
  cultural: 'Towns & Gateways',
  architectural: 'Architecture',
  industrial: 'Industry & Mining',
  culinary: 'Food & Drink',
  roadside: 'Roadside Stops',
  attraction: 'Attractions',
};

const CATEGORY_ORDER = [
  'geological',
  'natural',
  'recreational',
  'historical',
  'cultural',
  'architectural',
  'industrial',
  'culinary',
  'roadside',
  'attraction',
];

// Render inline [label](href) markdown links within a plain-text string.
// Internal links (starting with "/") use next/link; external links use <a>.
function renderInline(text) {
  const parts = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    if (/^https?:\/\//.test(href)) {
      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.inlineLink}
        >
          {label}
        </a>
      );
    } else {
      parts.push(
        <Link key={key++} href={href} style={styles.inlineLink}>
          {label}
        </Link>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function RegionPage() {
  const params = useParams();
  const slug = params?.slug;

  const [region, setRegion] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      setLoading(true);

      // Fetch the region
      const { data: regionData, error: regionErr } = await supabase
        .from('regions')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      if (regionErr || !regionData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setRegion(regionData);

      // Fetch the POIs that belong to this region
      const { data: poiData } = await supabase
        .from('region_pois')
        .select(
          'poi:pois(id, name, slug, tagline, nearest_city, nearest_highway, category, thumbnail_url, published)'
        )
        .eq('region_id', regionData.id);

      const cleaned = (poiData || [])
        .map((row) => row.poi)
        .filter((p) => p && p.published !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setPlaces(cleaned);
      setLoading(false);
    }

    load();
  }, [slug]);

  // SEO meta tags
  useEffect(() => {
    if (!region) return;

    const title = region.seo_title || `${region.name} | Open Road Guide`;
    const desc =
      region.meta_description ||
      region.short_description ||
      `Explore ${region.name} — a complete regional guide with the places worth stopping for.`;

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
    setMeta('meta[property="og:type"]', 'content', 'article');
    if (region.hero_image_url) {
      setMeta('meta[property="og:image"]', 'content', region.hero_image_url);
    }

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://openroadguide.com/region/${slug}`);
  }, [region, slug]);

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.loading}>Loading…</div>
      </main>
    );
  }

  if (notFound || !region) {
    return (
      <main style={styles.main}>
        <div style={styles.notFound}>
          <h1 style={styles.notFoundTitle}>Region not found</h1>
          <p>We couldn&apos;t find a region called &ldquo;{slug}&rdquo;.</p>
          <Link href="/" style={styles.link}>
            ← Back to Open Road Guide
          </Link>
        </div>
      </main>
    );
  }

  // Split description into paragraphs
  const paragraphs = (region.description || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Group places by category, in display order
  const grouped = [];
  const seen = new Set();
  const pushGroup = (cat) => {
    if (seen.has(cat)) return;
    const items = places.filter((p) => (p.category || 'attraction') === cat);
    if (items.length > 0) {
      grouped.push({
        category: cat,
        label: CATEGORY_LABELS[cat] || 'More to Explore',
        items,
      });
      seen.add(cat);
    }
  };
  CATEGORY_ORDER.forEach(pushGroup);
  // Catch any categories not in the predefined order
  places.forEach((p) => pushGroup(p.category || 'attraction'));

  return (
    <main style={styles.main}>
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{region.name}</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        {region.state && (
          <div style={styles.eyebrow}>{region.state} · Region</div>
        )}
        <h1 style={styles.title}>{region.name}</h1>
        {region.short_description && (
          <p style={styles.tagline}>{region.short_description}</p>
        )}
        {places.length > 0 && (
          <div style={styles.placeCount}>
            {places.length} {places.length === 1 ? 'place' : 'places'} to explore
          </div>
        )}
      </header>

      {/* Long-form intro */}
      {paragraphs.length > 0 && (
        <section style={styles.intro}>
          {paragraphs.map((p, i) => (
            <p key={i} style={styles.introPara}>
              {renderInline(p)}
            </p>
          ))}
        </section>
      )}

      {/* Places, grouped by category */}
      {places.length > 0 && (
        <section style={styles.placesSection}>
          <h2 style={styles.placesHeading}>What to See in {region.name}</h2>
          <p style={styles.placesSub}>
            {places.length} places across the region, grouped by what they are.
          </p>

          {grouped.map((group) => (
            <div key={group.category} style={styles.categoryGroup}>
              <h3 style={styles.categoryHeading}>{group.label}</h3>
              <div style={styles.placesGrid}>
                {group.items.map((place) => (
                  <Link
                    key={place.id}
                    href={`/poi/${place.slug || toSlug(place.name)}`}
                    style={styles.placeCard}
                  >
                    <div style={styles.placeHeader}>
                      <h4 style={styles.placeName}>{place.name}</h4>
                      {place.nearest_city && (
                        <div style={styles.placeCity}>{place.nearest_city}</div>
                      )}
                    </div>
                    {place.tagline && (
                      <p style={styles.placeTagline}>{place.tagline}</p>
                    )}
                    <div style={styles.placeCta}>View details →</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Closing callout */}
      <section style={styles.closing}>
        <p style={styles.closingText}>
          {region.name} rewards the unhurried. Pick a base, fan out, and let the
          country between the headline stops surprise you.
        </p>
        <Link href="/" style={styles.closingLink}>
          ← Explore more of Open Road Guide
        </Link>
      </section>
    </main>
  );
}

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
  notFound: { textAlign: 'center', padding: '4rem 1rem' },
  notFoundTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    marginBottom: '1rem',
  },
  link: { color: COLORS.coral, textDecoration: 'none', fontWeight: 500 },
  inlineLink: {
    color: COLORS.coral,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    fontWeight: 500,
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
    marginBottom: '3rem',
    paddingBottom: '2rem',
    borderBottom: `3px solid ${COLORS.coral}`,
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
    fontSize: 'clamp(2.25rem, 7vw, 4rem)',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    lineHeight: 1.05,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  tagline: {
    fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)',
    lineHeight: 1.5,
    color: '#3a3a4e',
    margin: '0 0 1.25rem 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
    maxWidth: '50rem',
  },
  placeCount: {
    display: 'inline-block',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.ink,
    background: COLORS.yellow,
    padding: '0.4rem 0.85rem',
    borderRadius: '999px',
  },

  intro: {
    marginBottom: '4rem',
    maxWidth: '46rem',
  },
  introPara: {
    fontSize: 'clamp(1.05rem, 2vw, 1.15rem)',
    lineHeight: 1.75,
    color: '#2a2a3e',
    margin: '0 0 1.4rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
  },

  placesSection: { marginBottom: '4rem' },
  placesHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: COLORS.ink,
  },
  placesSub: {
    fontSize: '1rem',
    color: COLORS.warmGray,
    marginBottom: '2.5rem',
    lineHeight: 1.5,
  },
  categoryGroup: { marginBottom: '2.75rem' },
  categoryHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
    fontWeight: 600,
    color: COLORS.ink,
    margin: '0 0 1.25rem 0',
    paddingBottom: '0.4rem',
    borderBottom: `2px solid ${COLORS.teal}`,
    display: 'inline-block',
  },
  placesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
    gap: '1.25rem',
  },
  placeCard: {
    display: 'block',
    padding: 'clamp(1rem, 2.5vw, 1.4rem)',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '12px',
    textDecoration: 'none',
    color: 'inherit',
    transition:
      'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    cursor: 'pointer',
  },
  placeHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.5rem',
    marginBottom: '0.6rem',
  },
  placeName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.15rem, 2.5vw, 1.35rem)',
    fontWeight: 600,
    margin: 0,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  placeCity: {
    fontSize: '0.78rem',
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
    flexShrink: 0,
  },
  placeTagline: {
    fontSize: '0.95rem',
    lineHeight: 1.55,
    color: '#555',
    margin: '0 0 0.75rem 0',
  },
  placeCta: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: COLORS.coral,
    letterSpacing: '0.02em',
  },

  closing: {
    textAlign: 'center',
    padding: '3rem 1rem',
    marginTop: '2rem',
    borderTop: '1px solid #eee',
  },
  closingText: {
    fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
    lineHeight: 1.6,
    color: '#3a3a4e',
    margin: '0 0 1rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
    fontStyle: 'italic',
    maxWidth: '40rem',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  closingLink: {
    color: COLORS.coral,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
};
