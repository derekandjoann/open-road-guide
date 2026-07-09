import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Render on demand, server-side (matching the POI, route, and marker pages).
// Tag prose and tagged POIs land in Supabase continuously; a tag's page
// reflects the current data the moment it's requested, with no deploy.
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BASE = 'https://openroadguide.com';

const toSlug = (s) =>
  s
    ?.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || '';

// Open Road Guide brand palette mapped to your tag_categories.slug values
const CATEGORY_COLORS = {
  theme:     '#9D4EDD', // violet
  geology:   '#7B5E57', // earthy brown
  activity:  '#FF6B6B', // coral
  season:    '#FFD93D', // sunny yellow
  vibe:      '#4ECDC4', // teal
  practical: '#06A77D', // green
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

// Normalize highway values so "Hwy 12" and "Highway 12" group together,
// and stuff with no highway falls into "Other Roads".
function normalizeHighway(raw) {
  if (!raw || typeof raw !== 'string') return 'Other Roads';
  const trimmed = raw.trim();
  if (!trimmed) return 'Other Roads';
  return trimmed
    .replace(/^hwy\.?\s+/i, 'Highway ')
    .replace(/^highway\s+/i, 'Highway ')
    .replace(/^us\s*-?\s*/i, 'US-')
    .replace(/^i\s*-?\s*(\d)/i, 'I-$1')
    .replace(/^sr\s*-?\s*/i, 'SR-')
    .replace(/^utah\s+/i, 'Utah ');
}

// Sort highways: numbered Highway / US- / I- / SR- groups first by number,
// "Other Roads" always last.
function highwaySortKey(name) {
  if (name === 'Other Roads') return [9999, name];
  const numMatch = name.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 9000;
  return [num, name];
}

async function fetchTag(
  slug,
  columns = 'id, name, slug, description, seo_title, meta_description, category:tag_categories(id, name, slug)'
) {
  const { data } = await supabase
    .from('tags')
    .select(columns)
    .eq('slug', slug)
    .maybeSingle();
  return data || null;
}

// Server-rendered per-tag metadata: real <title>/<meta>/canonical/OG in the
// initial HTML, drawn from the tag's own seo_title / meta_description.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tag = await fetchTag(slug, 'name, description, seo_title, meta_description');

  if (!tag) {
    return { title: { absolute: 'Tag not found | Open Road Guide' } };
  }

  const title = tag.seo_title
    ? `${tag.seo_title} | Open Road Guide`
    : `${tag.name} | Open Road Guide`;
  const description = (
    tag.meta_description ||
    tag.description ||
    `Places tagged ${tag.name} across the American West.`
  ).slice(0, 300);
  const url = `${BASE}/tag/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
  };
}

export default async function TagPage({ params }) {
  const { slug } = await params;

  const tag = await fetchTag(slug);
  // Unknown slug -> real 404 via the site-wide app/not-found.js.
  if (!tag) notFound();

  const category = tag.category;

  // Tagged POIs (published only), grouped by nearest highway.
  const { data: pairs } = await supabase
    .from('poi_tags')
    .select(
      'poi:pois(id, name, slug, tagline, description, nearest_highway, nearest_city, category, thumbnail_url, published)'
    )
    .eq('tag_id', tag.id);

  const pois = (pairs || [])
    .map((p) => p.poi)
    .filter((p) => p && p.published !== false);

  const grouped = {};
  pois.forEach((p) => {
    const hwy = normalizeHighway(p.nearest_highway);
    if (!grouped[hwy]) grouped[hwy] = [];
    grouped[hwy].push(p);
  });
  Object.keys(grouped).forEach((h) =>
    grouped[h].sort((a, b) => a.name.localeCompare(b.name))
  );

  const poiCount = pois.length;
  const highways = Object.keys(grouped).sort((a, b) => {
    const [na, sa] = highwaySortKey(a);
    const [nb, sb] = highwaySortKey(b);
    if (na !== nb) return na - nb;
    return sa.localeCompare(sb);
  });

  // Related tags: other tags co-occurring on these POIs, most-shared first.
  let relatedTags = [];
  if (pois.length) {
    const poiIds = pois.map((p) => p.id);
    const { data: coTags } = await supabase
      .from('poi_tags')
      .select('tag:tags(id, name, slug, category:tag_categories(slug))')
      .in('poi_id', poiIds);

    const counts = {};
    (coTags || []).forEach((row) => {
      const t = row.tag;
      if (!t || t.id === tag.id) return;
      if (!counts[t.id]) counts[t.id] = { tag: t, count: 0 };
      counts[t.id].count += 1;
    });
    relatedTags = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((x) => x.tag);
  }

  const accentColor = colorForCategory(category?.slug);

  // The editorial intro is the tag's own description when we've written one;
  // otherwise a plain factual line (undescribed tags aren't in the sitemap).
  const intro =
    tag.description && tag.description.length > 40
      ? tag.description
      : `${poiCount} ${tag.name.toLowerCase()} ${
          poiCount === 1 ? 'stop' : 'stops'
        } across the guide.`;

  // ---------- Structured data (JSON-LD) ----------
  // A CollectionPage describes the tag landing page; a BreadcrumbList mirrors
  // the on-page Home > Tag trail. Only fields we actually have are emitted.
  const pageUrl = `${BASE}/tag/${slug}`;
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${tag.name} — Open Road Guide`,
    url: pageUrl,
  };
  if (tag.description) collectionLd.description = tag.description;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: tag.name, item: pageUrl },
    ],
  };

  const jsonLdHtml = JSON.stringify([collectionLd, breadcrumbLd]).replace(
    /</g,
    '\\u003c'
  );

  return (
    <main style={styles.main}>
      {/* Structured data for search engines (read from the server-rendered HTML) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />

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
          {highways.length > 1 && ` along ${highways.length} ${highways.length === 1 ? 'road' : 'roads'}`}
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
        highways.map((hwy) => (
          <section key={hwy} style={styles.regionSection}>
            <h2 style={{ ...styles.regionTitle, color: accentColor }}>
              {hwy}
              <span style={styles.regionCount}>{grouped[hwy].length}</span>
            </h2>
            <div style={styles.poiGrid}>
              {grouped[hwy].map((poi) => {
                const preview =
                  poi.tagline ||
                  (poi.description && poi.description.length > 140
                    ? poi.description.slice(0, 140).trim() + '…'
                    : poi.description);
                return (
                  <Link
                    key={poi.id}
                    href={`/poi/${poi.slug || toSlug(poi.name)}`}
                    style={styles.poiCard}
                  >
                    <h3 style={styles.poiName}>{poi.name}</h3>
                    {poi.nearest_city && (
                      <div style={styles.poiCity}>{poi.nearest_city}</div>
                    )}
                    {preview && <p style={styles.poiDesc}>{preview}</p>}
                  </Link>
                );
              })}
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
                  style={{ ...styles.relatedPill, borderColor: color, color }}
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
  poiCity: {
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
