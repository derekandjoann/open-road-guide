import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import MapView from '../../../components/MapView';

// Render every trail on demand (server-side) rather than statically at build
// time — same rationale as the itinerary, POI, and marker pages: the prose
// lives in Supabase and edits go live instantly with no deploy, while crawlers
// still get fully server-rendered HTML plus real per-page <title>/<meta>/OG.
export const dynamic = 'force-dynamic';

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

// A trail carries its own accent (violet) to set it apart from itineraries
// (yellow), scenic drives (teal), and stories (coral).
const ACCENT = COLORS.violet;

// Serve a right-sized hero from Supabase's render endpoint instead of the
// multi-megabyte original. Falls back untouched for non-Supabase URLs.
function heroSrc(url, width = 1600) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

// Flatten markdown-ish prose to plain text for JSON-LD and meta descriptions.
function toPlainText(md) {
  return (md || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[#_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Inline renderer: [label](href) links (internal via <Link>, external new tab)
// and **bold** spans; everything else passes through as text.
function renderRich(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] != null) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const label = match[2];
      const href = match[3];
      if (/^https?:\/\//.test(href)) {
        parts.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" style={styles.inlineLink}>
            {label}
          </a>
        );
      } else {
        parts.push(
          <Link key={key++} href={href} style={styles.inlineLink}>{label}</Link>
        );
      }
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// Split prose into paragraphs on blank lines.
function toParagraphs(text) {
  return (text || '')
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const titleCase = (s) =>
  (s || '').split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

async function fetchTrail(slug, columns = '*') {
  const { data } = await supabase
    .from('trails')
    .select(columns)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  return data || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const trail = await fetchTrail(
    slug,
    'title, subtitle, seo_title, meta_description, body, hero_image_url'
  );

  if (!trail) {
    return { title: { absolute: 'Trail not found | Open Road Guide' } };
  }

  const title = trail.seo_title || `${trail.title} | Open Road Guide`;
  const description =
    trail.meta_description || trail.subtitle || toPlainText(trail.body).slice(0, 160);
  const url = `https://openroadguide.com/trail/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      ...(trail.hero_image_url ? { images: [heroSrc(trail.hero_image_url, 1200)] } : {}),
    },
  };
}

export default async function TrailPage({ params }) {
  const { slug } = await params;

  const trail = await fetchTrail(slug);

  // Unknown or unpublished slug -> a real 404 via the site-wide app/not-found.js,
  // not a soft 200 (the Phase C convention).
  if (!trail) {
    notFound();
  }

  // Ordered stops, each joined to its published POI.
  const { data: stopRows } = await supabase
    .from('trail_pois')
    .select('order_index, note, poi:pois(id, slug, name, tagline, category, state, latitude, longitude, published)')
    .eq('trail_id', trail.id)
    .order('order_index', { ascending: true });

  const stops = (stopRows || [])
    .filter((row) => row.poi && row.poi.published)
    .map((row) => ({
      order_index: row.order_index,
      note: row.note,
      ...row.poi,
    }));

  // POIs with coordinates feed the map. Each carries an href so MapView's popup
  // links straight to the stop's own page.
  const mapPois = stops
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
    .map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      tagline: s.tagline,
      category: s.category,
      latitude: s.latitude,
      longitude: s.longitude,
      href: `/poi/${s.slug}`,
    }));

  const crossing = Array.isArray(trail.crossing_states) ? trail.crossing_states : [];
  const seasons = Array.isArray(trail.best_seasons)
    ? trail.best_seasons.map(titleCase).join(' · ')
    : trail.best_seasons || '';

  const statBits = [
    stops.length > 0 && `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`,
    crossing.length > 0 && `${crossing.length} ${crossing.length === 1 ? 'state' : 'states'}`,
    seasons && `Best ${seasons}`,
  ].filter(Boolean);

  // ---------- Structured data (JSON-LD) ----------
  // An ItemList captures the ordered stops (each a TouristAttraction with its
  // own URL); a BreadcrumbList mirrors the on-page Home › Trail path. Only
  // fields we actually have are emitted — no guessed values.
  const trailUrl = `https://openroadguide.com/trail/${slug}`;
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: trail.title,
    description: trail.subtitle || toPlainText(trail.body).slice(0, 200),
    numberOfItems: stops.length,
    itemListElement: stops.map((s) => ({
      '@type': 'ListItem',
      position: s.order_index,
      item: {
        '@type': 'TouristAttraction',
        name: s.name,
        url: `https://openroadguide.com/poi/${s.slug}`,
      },
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://openroadguide.com/' },
      { '@type': 'ListItem', position: 2, name: trail.title, item: trailUrl },
    ],
  };
  const jsonLdHtml = JSON.stringify([itemListLd, breadcrumbLd]).replace(/</g, '\\u003c');

  return (
    <main style={styles.main}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />

      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{trail.title}</span>
      </nav>

      {/* Hero image (renders fine without one) */}
      {trail.hero_image_url && (
        <figure style={styles.heroFigure}>
          <img src={heroSrc(trail.hero_image_url)} alt={trail.title} style={styles.heroImage} loading="eager" />
          {trail.hero_image_credit && (
            <figcaption style={styles.heroCredit}>{trail.hero_image_credit}</figcaption>
          )}
        </figure>
      )}

      {/* Title block */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Cross-State Trail</div>
        <h1 style={styles.title}>{trail.title}</h1>
        {trail.subtitle && <p style={styles.tagline}>{trail.subtitle}</p>}
        {statBits.length > 0 && <div style={styles.statLine}>{statBits.join(' · ')}</div>}
        {crossing.length > 0 && (
          <div style={styles.crossingRow}>
            {crossing.map((st) => (
              <Link key={st} href={`/${toSlugState(st)}`} style={styles.crossingChip}>{st}</Link>
            ))}
          </div>
        )}
      </header>

      {/* Intro / the through-line */}
      {trail.body && (
        <section style={styles.intro}>
          {toParagraphs(trail.body).map((para, i) => (
            <p key={i} style={styles.introPara}>{renderRich(para)}</p>
          ))}
        </section>
      )}

      {/* The whole trail, one map */}
      {mapPois.length > 0 && (
        <section style={styles.mapSection}>
          <h2 style={styles.sectionHeading}>The whole trail, one map</h2>
          <p style={styles.sectionSub}>
            Every stop, scattered across the West as the mines were. Tap any dot for the story.
          </p>
          <MapView pois={mapPois} height="520px" />
        </section>
      )}

      {/* The stops, in order */}
      <section style={styles.stopsSection}>
        <h2 style={styles.sectionHeading}>The stops</h2>
        <p style={styles.sectionSub}>
          In order along the arc — not one road, but one story told thirteen ways.
        </p>
        {stops.map((s) => (
          <article key={s.id} style={styles.stopCard}>
            <div style={styles.stopHead}>
              <div style={styles.stopBadge}>{s.order_index}</div>
              <div style={styles.stopHeadText}>
                <div style={styles.stopEyebrow}>
                  Stop {s.order_index}{s.state ? ` · ${s.state}` : ''}
                </div>
                <h3 style={styles.stopTitle}>
                  <Link href={`/poi/${s.slug}`} style={styles.stopTitleLink}>{s.name}</Link>
                </h3>
              </div>
            </div>
            {s.note && <p style={styles.stopNote}>{renderRich(s.note)}</p>}
            <Link href={`/poi/${s.slug}`} style={styles.stopCta}>Visit {s.name} →</Link>
          </article>
        ))}
      </section>

      {/* Closing */}
      <div style={styles.backWrap}>
        <Link href="/" style={styles.backLink}>← Explore Open Road Guide</Link>
      </div>
    </main>
  );
}

// State name -> hub slug. State hubs live at the top level (/nevada, /utah…).
function toSlugState(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
}

// ---- Styles ----

const styles = {
  main: {
    maxWidth: '860px',
    margin: '0 auto',
    padding: 'clamp(1rem, 4vw, 2.5rem)',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.ink,
  },

  breadcrumb: {
    fontSize: '0.9rem', color: COLORS.warmGray, marginBottom: '1.5rem',
    display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
  },
  crumbLink: { color: COLORS.warmGray, textDecoration: 'none' },
  crumbSep: { color: '#bbb' },
  crumbCurrent: { color: COLORS.ink, fontWeight: 500 },

  heroFigure: { margin: '0 0 1.75rem 0', position: 'relative' },
  heroImage: {
    width: '100%', height: 'auto', display: 'block', borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(26,26,46,0.18)',
  },
  heroCredit: {
    fontSize: '0.72rem', color: COLORS.warmGray, marginTop: '0.5rem',
    fontStyle: 'italic', textAlign: 'right', fontFamily: "'Fraunces', Georgia, serif",
  },

  hero: {
    marginBottom: '2.25rem', paddingBottom: '1.75rem',
    borderBottom: `3px solid ${ACCENT}`,
  },
  eyebrow: {
    fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: ACCENT, marginBottom: '0.75rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(2.1rem, 7vw, 3.4rem)',
    fontWeight: 600, margin: '0 0 0.9rem 0', lineHeight: 1.08, color: COLORS.ink,
  },
  tagline: {
    fontSize: 'clamp(1.02rem, 2.2vw, 1.25rem)', lineHeight: 1.55, color: '#3a3a4e',
    margin: '0 0 1.1rem 0', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif",
  },
  statLine: {
    fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: COLORS.warmGray, marginBottom: '0.9rem',
  },
  crossingRow: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  crossingChip: {
    fontSize: '0.8rem', fontWeight: 600, color: ACCENT, textDecoration: 'none',
    border: `1.5px solid ${ACCENT}`, borderRadius: '999px', padding: '0.25rem 0.8rem',
    background: 'rgba(157,78,221,0.06)',
  },

  intro: { marginBottom: '2.5rem' },
  introPara: {
    fontSize: 'clamp(1.02rem, 2.1vw, 1.12rem)', lineHeight: 1.75,
    margin: '0 0 1.1rem 0', color: '#2a2a3e',
  },

  mapSection: { marginBottom: '2.75rem' },
  sectionHeading: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
    fontWeight: 600, margin: '0 0 0.4rem 0', color: COLORS.ink,
  },
  sectionSub: { fontSize: '0.98rem', color: COLORS.warmGray, margin: '0 0 1.25rem 0', lineHeight: 1.5 },

  stopsSection: { marginBottom: '3rem' },
  stopCard: {
    background: '#fff', border: '1px solid #ececec', borderRadius: '14px',
    padding: 'clamp(1.25rem, 3.5vw, 1.9rem)', marginBottom: '1.5rem',
  },
  stopHead: { display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.9rem' },
  stopBadge: {
    flex: '0 0 auto', width: '2.6rem', height: '2.6rem', borderRadius: '999px',
    background: ACCENT, color: '#fff',
    fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: '1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stopHeadText: { flex: '1 1 auto', minWidth: 0 },
  stopEyebrow: {
    fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: ACCENT, marginBottom: '0.2rem',
  },
  stopTitle: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.3rem, 4vw, 1.7rem)',
    fontWeight: 600, margin: 0, lineHeight: 1.15, color: COLORS.ink,
  },
  stopTitleLink: { color: COLORS.ink, textDecoration: 'none' },
  stopNote: {
    fontSize: 'clamp(0.98rem, 2vw, 1.05rem)', lineHeight: 1.75,
    margin: '0 0 1rem 0', color: '#2a2a3e',
  },
  stopCta: { color: ACCENT, textDecoration: 'none', fontWeight: 700, fontSize: '0.95rem' },

  inlineLink: {
    color: '#7d33bd', textDecoration: 'none',
    borderBottom: '1.5px solid rgba(157,78,221,0.5)', paddingBottom: '1px',
  },

  backWrap: { borderTop: '1px solid #ececec', paddingTop: '2rem', textAlign: 'center' },
  backLink: { color: ACCENT, textDecoration: 'none', fontWeight: 600, fontSize: '1rem' },
};
