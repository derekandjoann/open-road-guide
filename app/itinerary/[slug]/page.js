import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

// Render every itinerary on demand (server-side) rather than statically at
// build time — same rationale as the POI and marker pages: the prose lives in
// Supabase and edits go live instantly with no deploy, while crawlers still
// get fully server-rendered HTML plus real per-page <title>/<meta>/OG tags.
export const dynamic = 'force-dynamic';

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

// Flatten markdown-ish prose to plain text for JSON-LD and meta descriptions:
// [label](href) -> label, **bold** -> bold, collapse whitespace.
function toPlainText(md) {
  return (md || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[#_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Inline renderer for itinerary prose: handles [label](href) links (internal
// via <Link>, external in a new tab) and **bold** spans. Everything else
// passes through as text. Same pattern as the region page's renderInline,
// extended for bold because the practical-notes block uses it.
function renderRich(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] != null) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const label = match[2];
      const href = match[3];
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
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// Split prose into paragraphs on blank lines.
function toParagraphs(text) {
  return (text || '')
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchItinerary(slug, columns = '*') {
  const { data } = await supabase
    .from('itineraries')
    .select(columns)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  return data || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const itin = await fetchItinerary(
    slug,
    'title, subtitle, seo_title, meta_description, intro, hero_image_url'
  );

  if (!itin) {
    return { title: { absolute: 'Itinerary not found | Open Road Guide' } };
  }

  const title = itin.seo_title || `${itin.title} | Open Road Guide`;
  const description =
    itin.meta_description ||
    itin.subtitle ||
    toPlainText(itin.intro).slice(0, 160);
  const url = `https://openroadguide.com/itinerary/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      ...(itin.hero_image_url ? { images: [heroSrc(itin.hero_image_url, 1200)] } : {}),
    },
  };
}

export default async function ItineraryPage({ params }) {
  const { slug } = await params;

  const itin = await fetchItinerary(slug);

  // Unknown or unpublished slug -> a real 404 via the site-wide
  // app/not-found.js, not a soft 200 (the Phase C convention).
  if (!itin) {
    notFound();
  }

  // Days in order, plus the scenic drives this trip follows.
  const [{ data: dayRows }, { data: routeRows }] = await Promise.all([
    supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', itin.id)
      .order('day_number', { ascending: true }),
    supabase
      .from('itinerary_routes')
      .select('sort_order, route:routes(slug, name, short_description, total_miles, published)')
      .eq('itinerary_id', itin.id)
      .order('sort_order', { ascending: true }),
  ]);

  const days = dayRows || [];
  const drives = (routeRows || [])
    .map((row) => row.route)
    .filter((r) => r && r.published);

  const stateSlug = toSlug(itin.state);
  const pageUrl = `https://openroadguide.com/itinerary/${slug}`;

  const statBits = [
    itin.days_count && `${itin.days_count} days`,
    itin.total_miles && `${itin.total_miles} miles`,
    Array.isArray(itin.best_seasons) && itin.best_seasons.length > 0 &&
      `best in ${itin.best_seasons.join(' & ')}`,
  ].filter(Boolean);

  const introParagraphs = toParagraphs(itin.intro);
  const practicalParagraphs = toParagraphs(itin.practical_notes);

  // ---------- Structured data (JSON-LD) ----------
  // Ships in the server-rendered HTML, built inline per the codebase
  // convention. A TouristTrip describes the trip with its day-by-day
  // itinerary as an ItemList; a BreadcrumbList mirrors the on-page
  // Home › State › Itinerary trail. Only fields we actually have are emitted.
  const tripLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: itin.title,
    description:
      itin.meta_description || itin.subtitle || toPlainText(itin.intro).slice(0, 500),
    url: pageUrl,
  };
  if (itin.hero_image_url) {
    tripLd.image = itin.hero_image_url;
  }
  if (days.length > 0) {
    tripLd.itinerary = {
      '@type': 'ItemList',
      numberOfItems: days.length,
      itemListElement: days.map((d, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `Day ${d.day_number}: ${d.title}`,
      })),
    };
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://openroadguide.com/' },
      ...(stateSlug
        ? [{ '@type': 'ListItem', position: 2, name: itin.state, item: `https://openroadguide.com/${stateSlug}` }]
        : []),
      {
        '@type': 'ListItem',
        position: stateSlug ? 3 : 2,
        name: itin.title,
        item: pageUrl,
      },
    ],
  };

  // Escape "<" so prose containing "</script>" can't break out of the tag.
  const jsonLdHtml = JSON.stringify([tripLd, breadcrumbLd]).replace(/</g, '\\u003c');

  return (
    <main style={styles.main}>
      {/* Structured data for search engines (read from the server-rendered HTML) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />

      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>Home</Link>
        {stateSlug && (
          <>
            <span style={styles.crumbSep}>›</span>
            <Link href={`/${stateSlug}`} style={styles.crumbLink}>{itin.state}</Link>
          </>
        )}
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{itin.title}</span>
      </nav>

      {/* Hero image */}
      {itin.hero_image_url && (
        <figure style={styles.heroFigure}>
          <img
            src={heroSrc(itin.hero_image_url)}
            alt={itin.title}
            style={styles.heroImage}
            loading="eager"
          />
          {itin.hero_image_credit && (
            <figcaption style={styles.heroCredit}>{itin.hero_image_credit}</figcaption>
          )}
        </figure>
      )}

      {/* Title block */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>
          {itin.days_count ? `A ${itin.days_count}-Day Itinerary` : 'An Itinerary'}
        </div>
        <h1 style={styles.title}>{itin.title}</h1>
        {itin.subtitle && <p style={styles.tagline}>{itin.subtitle}</p>}
        {statBits.length > 0 && (
          <div style={styles.statLine}>{statBits.join(' · ')}</div>
        )}
        {(itin.start_location || itin.end_location) && (
          <div style={styles.routeLine}>
            {[itin.start_location, itin.end_location].filter(Boolean).join(' → ')}
          </div>
        )}
      </header>

      {/* Intro */}
      {introParagraphs.length > 0 && (
        <section style={styles.intro}>
          {introParagraphs.map((para, i) => (
            <p key={i} style={styles.introPara}>{renderRich(para)}</p>
          ))}
        </section>
      )}

      {/* Before you go — the practical fine print */}
      {practicalParagraphs.length > 0 && (
        <aside style={styles.practicalBox}>
          <h2 style={styles.practicalHeading}>Before you go</h2>
          {practicalParagraphs.map((para, i) => (
            <p key={i} style={styles.practicalPara}>{renderRich(para)}</p>
          ))}
        </aside>
      )}

      {/* The days */}
      <section style={styles.daysSection}>
        {days.map((d) => {
          const meta = [
            d.drive_miles && `${d.drive_miles} mi`,
            d.drive_hours && `about ${d.drive_hours} ${Number(d.drive_hours) === 1 ? 'hr' : 'hrs'} driving`,
            d.overnight_city && `overnight in ${d.overnight_city}`,
          ].filter(Boolean);
          return (
            <article key={d.id} style={styles.dayCard}>
              <div style={styles.dayHead}>
                <div style={styles.dayBadge}>{d.day_number}</div>
                <div style={styles.dayHeadText}>
                  <div style={styles.dayEyebrow}>Day {d.day_number}</div>
                  <h2 style={styles.dayTitle}>{d.title}</h2>
                  {meta.length > 0 && (
                    <div style={styles.dayMeta}>{meta.join(' · ')}</div>
                  )}
                </div>
              </div>
              {toParagraphs(d.body).map((para, i) => (
                <p key={i} style={styles.dayPara}>{renderRich(para)}</p>
              ))}
            </article>
          );
        })}
      </section>

      {/* The drives this trip follows */}
      {drives.length > 0 && (
        <section style={styles.drivesSection}>
          <h2 style={styles.drivesHeading}>The drives this trip follows</h2>
          <p style={styles.drivesSub}>
            Each one is traced end to end on its own page, with every stop worth making along the way.
          </p>
          <div style={styles.drivesGrid}>
            {drives.map((rt) => (
              <Link key={rt.slug} href={`/route/${rt.slug}`} style={styles.driveCard}>
                <div style={styles.driveEyebrow}>Scenic Byway</div>
                <h3 style={styles.driveTitle}>{rt.name}</h3>
                {rt.total_miles && (
                  <div style={styles.driveMeta}>{rt.total_miles} mi</div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Closing */}
      <div style={styles.backWrap}>
        {stateSlug ? (
          <Link href={`/${stateSlug}`} style={styles.backLink}>
            ← More of {itin.state}
          </Link>
        ) : (
          <Link href="/" style={styles.backLink}>← Explore Open Road Guide</Link>
        )}
      </div>
    </main>
  );
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
    borderBottom: `3px solid ${COLORS.yellow}`,
  },
  eyebrow: {
    fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: '#946600', marginBottom: '0.75rem',
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
    letterSpacing: '0.08em', color: COLORS.warmGray, marginBottom: '0.35rem',
  },
  routeLine: { fontSize: '0.92rem', color: COLORS.warmGray },

  intro: { marginBottom: '2rem' },
  introPara: {
    fontSize: 'clamp(1.02rem, 2.1vw, 1.12rem)', lineHeight: 1.75,
    margin: '0 0 1.1rem 0', color: '#2a2a3e',
  },

  practicalBox: {
    background: '#fef7e0',
    borderLeft: `4px solid ${COLORS.yellow}`,
    borderRadius: '0 14px 14px 0',
    padding: 'clamp(1.1rem, 3vw, 1.6rem)',
    marginBottom: '2.75rem',
  },
  practicalHeading: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.2rem', fontWeight: 700,
    margin: '0 0 0.75rem 0', color: '#946600',
  },
  practicalPara: { fontSize: '0.97rem', lineHeight: 1.7, margin: '0 0 0.8rem 0', color: '#3a3a2e' },

  daysSection: { marginBottom: '3rem' },
  dayCard: {
    background: '#fff', border: '1px solid #ececec', borderRadius: '14px',
    padding: 'clamp(1.25rem, 3.5vw, 1.9rem)', marginBottom: '1.5rem',
  },
  dayHead: {
    display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem',
  },
  dayBadge: {
    flex: '0 0 auto', width: '2.6rem', height: '2.6rem', borderRadius: '999px',
    background: COLORS.coral, color: '#fff',
    fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: '1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dayHeadText: { flex: '1 1 auto', minWidth: 0 },
  dayEyebrow: {
    fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: COLORS.coral, marginBottom: '0.2rem',
  },
  dayTitle: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.3rem, 4vw, 1.7rem)',
    fontWeight: 600, margin: '0 0 0.4rem 0', lineHeight: 1.15, color: COLORS.ink,
  },
  dayMeta: {
    fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: COLORS.warmGray,
  },
  dayPara: {
    fontSize: 'clamp(0.98rem, 2vw, 1.05rem)', lineHeight: 1.75,
    margin: '0 0 1rem 0', color: '#2a2a3e',
  },

  drivesSection: { marginBottom: '3rem' },
  drivesHeading: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
    fontWeight: 600, margin: '0 0 0.4rem 0', color: COLORS.ink,
  },
  drivesSub: { fontSize: '0.98rem', color: COLORS.warmGray, margin: '0 0 1.25rem 0', lineHeight: 1.5 },
  drivesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: '1rem',
  },
  driveCard: {
    display: 'flex', flexDirection: 'column',
    background: '#fff', border: '1px solid #ececec', borderTop: `4px solid ${COLORS.teal}`,
    borderRadius: '14px', padding: '1rem 1.15rem',
    textDecoration: 'none', color: 'inherit', cursor: 'pointer',
  },
  driveEyebrow: {
    fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#0f5957', marginBottom: '0.35rem',
  },
  driveTitle: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.1rem', fontWeight: 600,
    margin: '0 0 0.35rem 0', lineHeight: 1.2, color: COLORS.ink,
  },
  driveMeta: { fontSize: '0.8rem', fontWeight: 600, color: COLORS.warmGray, marginTop: 'auto' },

  inlineLink: {
    color: '#c43d2d', textDecoration: 'none',
    borderBottom: '1.5px solid rgba(255,107,107,0.5)', paddingBottom: '1px',
  },

  backWrap: { borderTop: '1px solid #ececec', paddingTop: '2rem', textAlign: 'center' },
  backLink: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600, fontSize: '1rem' },
};
