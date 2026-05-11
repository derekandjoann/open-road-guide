'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback slugifier
const toSlug = (s) =>
  s
    ?.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || '';

// Open Road Guide brand palette mapped to category slugs.
// Edit this map once you know your exact tag_categories.slug values.
const CATEGORY_COLORS = {
  activity: '#FF6B6B',
  landscape: '#4ECDC4',
  season: '#FFD93D',
  experience: '#9D4EDD',
  accessibility: '#06A77D',
  travel: '#F77F00',
  history: '#7B5E57',
  culture: '#E63946',
  food: '#F4A261',
  difficulty: '#5C7AEA',
};

const FALLBACK_PALETTE = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#9D4EDD', '#F77F00', '#06A77D'];

function colorForCategory(categorySlug) {
  if (!categorySlug) return '#FF6B6B';
  if (CATEGORY_COLORS[categorySlug]) return CATEGORY_COLORS[categorySlug];
  let hash = 0;
  for (let i = 0; i < categorySlug.length; i++) {
    hash = (hash * 31 + categorySlug.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

function buildIntro(tag, poiCount, regions) {
  if (tag?.description && tag.description.length > 40) {
    return tag.description;
  }
  const regionList =
    regions.length > 3
      ? `${regions.slice(0, 3).join(', ')}, and beyond`
      : regions.join(' and ');
  const regionPhrase = regions.length ? ` across ${regionList}` : '';
  return `Discover ${poiCount} ${tag.name.toLowerCase()} ${
    poiCount === 1 ? 'destination' : 'destinations'
  } in Utah${regionPhrase}. Open Road Guide curates each stop with local context, seasonal tips, and the stories behind the place — so you know not just where to go, but when to go and why it matters.`;
}

export default function TagPage() {
  const params = useParams();
  const slug = params?.slug;

  const [tag, setTag] = useState(null);
  const [category, setCategory] = useState(null);
  const [poisByRegion, setPoisByRegion] = useState({});
  const [relatedTags, setRelatedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      setLoading(true);

      const { data: tagData, error: tagErr } = await supabase
        .from('tags')
        .select('id, name, slug, description, category:tag_categories(id, name, slug)')
        .eq('slug', slug)
        .maybeSingle();

      if (tagErr || !tagData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTag(tagData);
      setCategory(tagData.category);
      await loadPois(tagData.id);
      setLoading(false);
    }

    async function loadPois(tagId) {
      const { data: pairs } = await supabase
        .from('poi_tags')
        .select('poi:pois(id, name, slug, description, region, category)')
        .eq('tag_id', tagId);

      const pois = (pairs || []).map((p) => p.poi).filter(Boolean);

      const grouped = {};
      pois.forEach((p) => {
        const region = p.region || 'Other';
        if (!grouped[region]) grouped[region] = [];
        grouped[region].push(p);
      });
      Object.keys(grouped).forEach((r) =>
        grouped[r].sort((a, b) => a.name.localeCompare(b.name))
      );
      setPoisByRegion(grouped);

      if (pois.length) {
        const poiIds = pois.map((p) => p.id);
        const { data: coTags } = await supabase
          .from('poi_tags')
          .select('tag:tags(id, name, slug, category:tag_categories(slug))')
          .in('poi_id', poiIds);

        const counts = {};
        (coTags || []).forEach((row) => {
          const t = row.tag;
          if (!t || t.id === tagId) return;
          if (!counts[t.id]) counts[t.id] = { tag: t, count: 0 };
          counts[t.id].count += 1;
        });
        const related = Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
          .map((x) => x.tag);
        setRelatedTags(related);
      }
    }

    load();
  }, [slug]);

  useEffect(() => {
    if (!tag) return;
    const poiCount = Object.values(poisByRegion).reduce((n, arr) => n + arr.length, 0);
    const title = `${tag.name} in Utah — ${poiCount} ${
      poiCount === 1 ? 'Place' : 'Places'
    } to Visit | Open Road Guide`;
    const desc = `Explore ${poiCount} ${tag.name.toLowerCase()} ${
      poiCount === 1 ? 'destination' : 'destinations'
    } in Utah with insider tips, seasonal context, and the stories behind each stop.`;

    document.title = title;

    const setMeta = (selector, attr, value) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const [, key, val] = selector.match(/\[(\w+)="([^"]+)"\]/) || [];
        if (key && val) el.setAttribute(key, val);
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
    canonical.setAttribute('href', `https://openroadguide.com/tag/${slug}`);
  }, [tag, poisByRegion, slug]);

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.loading}>Loading…</div>
      </main>
    );
  }

  if (notFound || !tag) {
    return (
      <main style={styles.main}>
        <div style={styles.notFound}>
          <h1 style={styles.notFoundTitle}>Tag not found</h1>
          <p>We couldn&apos;t find a tag called &ldquo;{slug}&rdquo;.</p>
          <Link href="/" style={styles.link}>
            ← Back to Open Road Guide
          </Link>
        </div>
      </main>
    );
  }

  const accentColor = colorForCategory(category?.slug);
  const poiCount = Object.values(poisByRegion).reduce((n, arr) => n + arr.length, 0);
  const regionNames = Object.keys(poisByRegion).sort();
  const intro = buildIntro(tag, poiCount, regionNames);

  return (
    <main style={styles.main}>
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{tag.name}</span>
      </nav>

      <header style={styles.header}>
        {category && (
          <div style={{ ...styles.categoryLabel, color: accentColor }}>
            {category.name}
          </div>
        )}
        <h1 style={{ ...styles.title, borderBottomColor: accentColor }}>
          {tag.name}
        </h1>
        <div style={styles.count}>
          {poiCount} {poiCount === 1 ? 'destination' : 'destinations'}
          {regionNames.length > 1 && ` across ${regionNames.length} regions`}
        </div>
      </header>

      <section style={styles.intro}>
        <p style={styles.introText}>{intro}</p>
      </section>

      {poiCount === 0 ? (
        <section style={styles.empty}>
          <p>No destinations are tagged with &ldquo;{tag.name}&rdquo; yet. Check back soon.</p>
        </section>
      ) : (
        regionNames.map((region) => (
          <section key={region} style={styles.regionSection}>
            <h2 style={{ ...styles.regionTitle, color: accentColor }}>
              {region}
              <span style={styles.regionCount}>
                {poisByRegion[region].length}
              </span>
            </h2>
            <div style={styles.poiGrid}>
              {poisByRegion[region].map((poi) => (
                <Link
                  key={poi.id}
                  href={`/poi/${poi.slug || toSlug(poi.name)}`}
                  style={styles.poiCard}
                >
                  <h3 style={styles.poiName}>{poi.name}</h3>
                  {poi.category && (
                    <div style={styles.poiCategory}>{poi.category}</div>
                  )}
                  {poi.description && (
                    <p style={styles.poiDesc}>
                      {poi.description.length > 140
                        ? poi.description.slice(0, 140).trim() + '…'
                        : poi.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {relatedTags.length > 0 && (
        <section style={styles.relatedSection}>
          <h2 style={styles.relatedTitle}>Related tags</h2>
          <div style={styles.relatedPills}>
            {relatedTags.map((t) => {
              const color = colorForCategory(t.category?.slug);
              return (
                <Link
                  key={t.id}
                  href={`/tag/${t.slug || toSlug(t.name)}`}
                  style={{
                    ...styles.relatedPill,
                    borderColor: color,
                    color: color,
                  }}
                >
                  {t.name}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

const styles = {
  main: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: 'clamp(1rem, 4vw, 2.5rem)',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#1a1a2e',
  },
  loading: { textAlign: 'center', padding: '4rem 1rem', fontSize: '1.1rem', color: '#666' },
  notFound: { textAlign: 'center', padding: '4rem 1rem' },
  notFoundTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    marginBottom: '1rem',
  },
  link: { color: '#FF6B6B', textDecoration: 'none', fontWeight: 500 },
  breadcrumb: {
    fontSize: '0.9rem',
    color: '#666',
    marginBottom: '1.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
  },
  crumbLink: { color: '#666', textDecoration: 'none' },
  crumbSep: { color: '#bbb' },
  crumbCurrent: { color: '#1a1a2e', fontWeight: 500 },
  header: { marginBottom: '2rem' },
  categoryLabel: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0.5rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(2rem, 6vw, 3.5rem)',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    paddingBottom: '0.75rem',
    borderBottom: '3px solid',
    wordBreak: 'break-word',
    lineHeight: 1.1,
  },
  count: { fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', color: '#666', fontWeight: 500 },
  intro: {
    marginBottom: '3rem',
    padding: 'clamp(1rem, 3vw, 1.5rem)',
    background: '#FFF8F0',
    borderRadius: '12px',
    borderLeft: '4px solid #FFD93D',
  },
  introText: {
    margin: 0,
    fontSize: 'clamp(1rem, 2vw, 1.1rem)',
    lineHeight: 1.7,
    color: '#3a3a4e',
  },
  regionSection: { marginBottom: '3rem' },
  regionTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
    fontWeight: 600,
    marginBottom: '1.25rem',
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
  },
  regionCount: {
    fontSize: '0.85rem',
    color: '#999',
    fontWeight: 400,
    fontFamily: "'Outfit', sans-serif",
  },
  poiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
    gap: '1.25rem',
  },
  poiCard: {
    display: 'block',
    padding: '1.25rem',
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: '12px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    cursor: 'pointer',
  },
  poiName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.2rem',
    fontWeight: 600,
    margin: '0 0 0.4rem 0',
    color: '#1a1a2e',
    wordBreak: 'break-word',
  },
  poiCategory: {
    fontSize: '0.8rem',
    color: '#4ECDC4',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
    marginBottom: '0.5rem',
  },
  poiDesc: { fontSize: '0.95rem', lineHeight: 1.55, color: '#555', margin: 0 },
  empty: { padding: '3rem 1rem', textAlign: 'center', color: '#666', fontSize: '1rem' },
  relatedSection: { marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #eee' },
  relatedTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
    fontWeight: 600,
    marginBottom: '1rem',
    color: '#1a1a2e',
  },
  relatedPills: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem' },
  relatedPill: {
    display: 'inline-block',
    padding: '0.45rem 0.9rem',
    border: '1.5px solid',
    borderRadius: '999px',
    fontSize: '0.9rem',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'background 0.15s ease',
  },
};