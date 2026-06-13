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

// Serve a right-sized, optimized hero from Supabase's image render endpoint
// instead of the multi-megabyte original (e.g. a 14.7 MB JPEG comes down to
// ~0.8 MB at width 1600). Falls back to the original URL untouched if it isn't
// in the expected public-object form, so a non-Supabase URL still works.
function heroSrc(url, width = 1600) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

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

// Pre-build a static page for every published region at deploy time.
// Unknown slugs still render on-demand; a deploy refreshes this list.
export async function generateStaticParams() {
  const { data } = await supabase
    .from('regions')
    .select('slug')
    .eq('published', true);

  return (data || [])
    .filter((r) => r.slug)
    .map((r) => ({ slug: r.slug }));
}

// Server-rendered metadata. Title, description, Open Graph tags and canonical
// ship in the initial HTML, so crawlers see them instead of "Loading…".
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const { data: region } = await supabase
    .from('regions')
    .select('name, seo_title, meta_description, short_description, hero_image_url')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (!region) {
    return { title: { absolute: 'Region not found | Open Road Guide' } };
  }

  const title = region.seo_title || `${region.name} | Open Road Guide`;
  const description =
    region.meta_description ||
    region.short_description ||
    `Explore ${region.name} — a complete regional guide with the places worth stopping for.`;
  const url = `https://openroadguide.com/region/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      ...(region.hero_image_url ? { images: [heroSrc(region.hero_image_url, 1200)] } : {}),
    },
  };
}

export default async function RegionPage({ params }) {
  const { slug } = await params;

  // Fetch the region
  const { data: region } = await supabase
    .from('regions')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (!region) {
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

  // Fetch the POIs that belong to this region (many-to-many via region_pois)
  const { data: poiData } = await supabase
    .from('region_pois')
    .select(
      'poi:pois(id, name, slug, tagline, nearest_city, nearest_highway, category, thumbnail_url, published)'
    )
    .eq('region_id', region.id);

  const places = (poiData || [])
    .map((row) => row.poi)
    .filter((p) => p && p.published !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

  // Structured data (JSON-LD): CollectionPage (with an ItemList of the
  // region's POIs) + BreadcrumbList. Emitted as a server-rendered <script>
  // so crawlers and AI answer engines can read a machine-readable summary of
  // the region and the places it collects alongside the visible prose.
  const pageUrl = `https://openroadguide.com/region/${slug}`;
  const ldDescription =
    region.meta_description ||
    region.short_description ||
    `Explore ${region.name} — a complete regional guide with the places worth stopping for.`;

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: region.name,
    description: ldDescription,
    inLanguage: 'en-US',
    url: pageUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Open Road Guide',
      url: 'https://openroadguide.com',
    },
    ...(region.hero_image_url ? { image: [heroSrc(region.hero_image_url, 1200)] } : {}),
    ...(places.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: places.length,
            itemListElement: places.map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `https://openroadguide.com/poi/${p.slug || toSlug(p.name)}`,
              name: p.name,
            })),
          },
        }
      : {}),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://openroadguide.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: region.name,
        item: pageUrl,
      },
    ],
  };

  // Escape "<" so a stray "</script>" in any field can't break out of the tag.
  const jsonLd = JSON.stringify([collectionLd, breadcrumbLd]).replace(
    /</g,
    '\\u003c'
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main style={styles.main}>
        <nav style={styles.breadcrumb}>
          <Link href="/" style={styles.crumbLink}>
            Home
          </Link>
          <span style={styles.crumbSep}>›</span>
          <span style={styles.crumbCurrent}>{region.name}</span>
        </nav>

        {/* Hero image banner */}
        {region.hero_image_url && (
          <figure style={styles.heroFigure}>
            <img
              src={heroSrc(region.hero_image_url)}
              alt={region.name}
              style={styles.heroImage}
              loading="eager"
            />
            {region.hero_image_credit && (
              <figcaption style={styles.heroCredit}>
                {renderInline(region.hero_image_credit)}
              </figcaption>
            )}
          </figure>
        )}

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
                      {place.thumbnail_url && (
                        <img
                          src={heroSrc(place.thumbnail_url, 600)}
                          alt={place.name}
                          loading="lazy"
                          style={styles.placeThumb}
                        />
                      )}
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
    </>
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

  heroFigure: {
    margin: '0 0 2rem 0',
  },
  heroImage: {
    display: 'block',
    width: '100%',
    height: 'auto',
    borderRadius: '16px',
    backgroundColor: COLORS.paper,
    boxShadow: '0 6px 24px rgba(26, 26, 46, 0.10)',
  },
  heroCredit: {
    fontSize: '0.72rem',
    color: COLORS.warmGray,
    marginTop: '0.5rem',
    textAlign: 'right',
    letterSpacing: '0.01em',
  },

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
    overflow: 'hidden',
  },
  // Card thumbnail. Pulled flush to the card edges with negative margins that
  // cancel the card's padding, so the image meets the rounded top corners
  // (overflow:hidden on the card clips it to the radius). A fixed-height cover
  // crop is intentional here and safe: these small grid cards need uniform
  // height, and the contain/zoom-bug caveat only applies to the large POI/region
  // hero band, not to compact card crops.
  placeThumb: {
    display: 'block',
    width: 'calc(100% + 2 * clamp(1rem, 2.5vw, 1.4rem))',
    height: '150px',
    objectFit: 'cover',
    margin:
      'calc(-1 * clamp(1rem, 2.5vw, 1.4rem)) calc(-1 * clamp(1rem, 2.5vw, 1.4rem)) clamp(0.9rem, 2vw, 1.1rem)',
    background: '#f0ebe4',
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
