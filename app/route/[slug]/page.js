import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import MapView from '../../../components/MapView';

// Render every route on demand (server-side) rather than statically at build
// time, matching the POI page. Route descriptions and route_pois editorial
// notes are prose edited through Supabase, and the established workflow is that
// such edits go live instantly with no deploy. Dynamic rendering preserves that
// while still shipping fully server-rendered HTML and real per-route
// <title>/<meta>/Open Graph tags (via generateMetadata) for crawlers.
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

// Serve a right-sized, optimized hero from Supabase's image render endpoint
// instead of the multi-megabyte original (e.g. a 7.6 MB JPEG comes down to
// ~0.5 MB at width 1600). Falls back to the original URL untouched if it isn't
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

// Flatten markdown prose to clean plain text for JSON-LD structured data:
// turn [label](href) into just "label", drop stray markdown punctuation, and
// collapse whitespace/newlines into single spaces.
function toPlainText(md) {
  return (md || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Server-rendered metadata. Title, description, Open Graph and canonical now
// ship in the initial HTML instead of being injected client-side after load.
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const { data: route } = await supabase
    .from('routes')
    .select('name, seo_title, meta_description, short_description, hero_image_url')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (!route) {
    return { title: { absolute: 'Route not found | Open Road Guide' } };
  }

  const title = route.seo_title || `${route.name} | Open Road Guide`;
  const description =
    route.meta_description ||
    route.short_description ||
    `Explore ${route.name} — a complete road trip guide with stops, stories, and timing tips.`;
  const url = `https://openroadguide.com/route/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      ...(route.hero_image_url ? { images: [heroSrc(route.hero_image_url, 1200)] } : {}),
    },
  };
}

export default async function RoutePage({ params }) {
  const { slug } = await params;

  // Fetch the route
  const { data: route } = await supabase
    .from('routes')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (!route) {
    return (
      <main style={styles.main}>
        <div style={styles.notFound}>
          <h1 style={styles.notFoundTitle}>Route not found</h1>
          <p>We couldn&apos;t find a route called &ldquo;{slug}&rdquo;.</p>
          <Link href="/" style={styles.link}>
            ← Back to Open Road Guide
          </Link>
        </div>
      </main>
    );
  }

  // Fetch the POIs in driving order
  const { data: stopData } = await supabase
    .from('route_pois')
    .select(
      'order_index, notes, poi:pois(id, name, slug, tagline, description, nearest_city, nearest_highway, category, thumbnail_url, published, latitude, longitude, visit_duration)'
    )
    .eq('route_id', route.id)
    .order('order_index', { ascending: true });

  const stops = (stopData || [])
    .filter((s) => s.poi && s.poi.published !== false)
    .map((s) => ({ ...s.poi, order_index: s.order_index, route_notes: s.notes }));

  // Historical markers tied to this route — roadside plaques and monuments.
  // These are texture, not stops: no individual pages, just name, note, and
  // who put them there. Rendered as a compact grid below the drive.
  const { data: markerData } = await supabase
    .from('route_markers')
    .select('marker:markers(id, name, erected_by, year_erected, note, latitude, longitude)')
    .eq('route_id', route.id);

  const histMarkers = (markerData || [])
    .map((m) => m.marker)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  // The route's road geometry — [lng, lat] pairs traced from OSM and stored
  // in routes.path_geojson. The at-a-glance map only renders when it exists.
  const hasRouteLine =
    Array.isArray(route.path_geojson) && route.path_geojson.length > 1;

  // Slim copies of the stops for the map. MapView is a client component, so
  // everything passed as props ships to the browser in the page payload —
  // the full description prose would bloat it for no reason. The popups only
  // need name, tagline, category, duration, and a place to stand.
  const mapStops = stops.map((s) => ({
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    category: s.category,
    latitude: s.latitude,
    longitude: s.longitude,
    visit_duration: s.visit_duration,
  }));

  // Split description into paragraphs
  const paragraphs = (route.description || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Format best_seasons array
  const seasonsText = Array.isArray(route.best_seasons)
    ? route.best_seasons.join(' · ')
    : route.best_seasons || '';

  // ---------- Structured data (JSON-LD) ----------
  // Ships in the server-rendered HTML. A TouristTrip describes the drive itself
  // and lists its stops in order as an itinerary; a BreadcrumbList mirrors the
  // Home › Routes › Route trail (the breadcrumb is what Google renders as a
  // rich result). Only fields we actually have are emitted.
  const routeUrl = `https://openroadguide.com/route/${slug}`;
  const ldDescription =
    route.meta_description ||
    route.short_description ||
    toPlainText(route.description || '').slice(0, 500) ||
    `Explore ${route.name} — a complete road trip guide.`;

  const tripLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: route.name,
    description: ldDescription,
    url: routeUrl,
  };
  if (stops.length > 0) {
    tripLd.itinerary = {
      '@type': 'ItemList',
      numberOfItems: stops.length,
      itemListElement: stops.map((stop, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'TouristAttraction',
          name: stop.name,
          url: `https://openroadguide.com/poi/${stop.slug || toSlug(stop.name)}`,
        },
      })),
    };
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://openroadguide.com/' },
      { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://openroadguide.com/routes' },
      { '@type': 'ListItem', position: 3, name: route.name, item: routeUrl },
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

      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <Link href="/routes" style={styles.crumbLink}>
          Routes
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{route.name}</span>
      </nav>

      {/* Hero image banner */}
      {route.hero_image_url && (
        <figure style={styles.heroFigure}>
          <img
            src={heroSrc(route.hero_image_url)}
            alt={route.name}
            style={styles.heroImage}
            loading="eager"
          />
          {route.hero_image_credit && (
            <figcaption style={styles.heroCredit}>
              {renderInline(route.hero_image_credit)}
            </figcaption>
          )}
        </figure>
      )}

      {/* Hero */}
      <header style={styles.hero}>
        {route.state && (
          <div style={styles.eyebrow}>{route.state} · Scenic Byway</div>
        )}
        <h1 style={styles.title}>{route.name}</h1>
        {route.short_description && (
          <p style={styles.tagline}>{route.short_description}</p>
        )}

        {/* Route stats */}
        <div style={styles.statsRow}>
          {route.start_location && route.end_location && (
            <div style={styles.stat}>
              <div style={styles.statLabel}>Route</div>
              <div style={styles.statValue}>
                {route.start_location} → {route.end_location}
              </div>
            </div>
          )}
          {route.total_miles && (
            <div style={styles.stat}>
              <div style={styles.statLabel}>Distance</div>
              <div style={styles.statValue}>{route.total_miles} miles</div>
            </div>
          )}
          {route.estimated_drive_hours && (
            <div style={styles.stat}>
              <div style={styles.statLabel}>Drive Time</div>
              <div style={styles.statValue}>
                {route.estimated_drive_hours} hours
              </div>
            </div>
          )}
          {seasonsText && (
            <div style={styles.stat}>
              <div style={styles.statLabel}>Best Seasons</div>
              <div style={styles.statValue}>{seasonsText}</div>
            </div>
          )}
          {route.difficulty && (
            <div style={styles.stat}>
              <div style={styles.statLabel}>Difficulty</div>
              <div style={styles.statValue}>{route.difficulty}</div>
            </div>
          )}
        </div>
      </header>

      {/* The route at a glance — the road drawn on the map, with every stop
          pinned along it. Only renders for routes with traced geometry. */}
      {hasRouteLine && (
        <section style={styles.mapSection}>
          <h2 style={styles.mapHeading}>The Route at a Glance</h2>
          <MapView
            pois={mapStops}
            historicalMarkers={histMarkers}
            routeLine={route.path_geojson}
            markerColor={COLORS.coral}
            height="460px"
          />
          <div style={styles.mapLegend}>
            <span style={styles.legendItem}>
              <span style={styles.legendLine} />
              The road
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: COLORS.coral }} />
              Stops
            </span>
            {histMarkers.length > 0 && (
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, background: COLORS.violet }} />
                Historical markers
              </span>
            )}
          </div>
        </section>
      )}

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

      {/* Stops along the route */}
      <section style={styles.stopsSection}>
        <h2 style={styles.stopsHeading}>The Drive, Stop by Stop</h2>
        <p style={styles.stopsSub}>
          {stops.length} stops along the route, in driving order from{' '}
          {route.start_location} to {route.end_location}.
        </p>

        <ol style={styles.stopsList}>
          {stops.map((stop, idx) => {
            const isLast = idx === stops.length - 1;
            return (
              <li key={stop.id} style={styles.stopItem}>
                <div style={styles.stopMarkerCol}>
                  <div style={styles.stopNumber}>{stop.order_index}</div>
                  {!isLast && <div style={styles.stopConnector} />}
                </div>
                <div style={styles.stopContent}>
                  <Link
                    href={`/poi/${stop.slug || toSlug(stop.name)}`}
                    style={styles.stopCard}
                  >
                    <div style={styles.stopHeader}>
                      <h3 style={styles.stopName}>{stop.name}</h3>
                      {stop.nearest_city && (
                        <div style={styles.stopCity}>{stop.nearest_city}</div>
                      )}
                    </div>
                    {stop.route_notes ? (
                      <p style={styles.stopNotes}>{stop.route_notes}</p>
                    ) : stop.tagline ? (
                      <p style={styles.stopTagline}>{stop.tagline}</p>
                    ) : null}
                    <div style={styles.stopCta}>View details →</div>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Historical markers along the corridor */}
      {histMarkers.length > 0 && (
        <section style={styles.markersSection}>
          <h2 style={styles.markersHeading}>Markers Along This Road</h2>
          <p style={styles.markersSub}>
            Roadside plaques and monuments worth a pull-over — small history,
            standing exactly where it happened.
          </p>
          <div style={styles.markersGrid}>
            {histMarkers.map((m) => (
              <div key={m.id} style={styles.markerCard}>
                <div style={styles.markerEyebrow}>Historical Marker</div>
                <h3 style={styles.markerName}>{m.name}</h3>
                {m.note && <p style={styles.markerNote}>{m.note}</p>}
                {(m.erected_by || m.year_erected) && (
                  <div style={styles.markerMeta}>
                    {[m.erected_by, m.year_erected].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Closing callout */}
      <section style={styles.closing}>
        <p style={styles.closingText}>
          That&apos;s the drive. Take your time, pull over often, and let{' '}
          {route.name} do what it does best.
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
    margin: '0 0 2rem 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
    maxWidth: '50rem',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
    gap: '1.25rem',
    marginTop: '1rem',
  },
  stat: {
    padding: '0.85rem 1rem',
    background: COLORS.paper,
    borderRadius: '10px',
    borderLeft: `3px solid ${COLORS.yellow}`,
  },
  statLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.warmGray,
    marginBottom: '0.3rem',
  },
  statValue: {
    fontSize: '1rem',
    fontWeight: 600,
    color: COLORS.ink,
  },

  mapSection: { marginBottom: '4rem' },
  mapHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
    fontWeight: 600,
    marginBottom: '1.25rem',
    color: COLORS.ink,
  },
  mapLegend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.5rem',
    marginTop: '0.85rem',
    fontSize: '0.85rem',
    color: COLORS.warmGray,
    fontWeight: 500,
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  legendLine: {
    display: 'inline-block',
    width: '26px',
    height: '4px',
    borderRadius: '2px',
    background: COLORS.coral,
    boxShadow: '0 0 0 1.5px #fff, 0 0 0 2.5px #e5e5e5',
  },
  legendDot: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    borderRadius: '50%',
    flexShrink: 0,
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

  stopsSection: { marginBottom: '4rem' },
  stopsHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: COLORS.ink,
  },
  stopsSub: {
    fontSize: '1rem',
    color: COLORS.warmGray,
    marginBottom: '2.5rem',
    lineHeight: 1.5,
  },
  stopsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  stopItem: {
    display: 'flex',
    gap: '1.25rem',
    marginBottom: '1.5rem',
    alignItems: 'stretch',
  },
  stopMarkerCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
  },
  stopNumber: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: COLORS.coral,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.05rem',
    fontWeight: 700,
    fontFamily: "'Outfit', sans-serif",
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(255, 107, 107, 0.3)',
  },
  stopConnector: {
    flexGrow: 1,
    width: '2px',
    background: `linear-gradient(to bottom, ${COLORS.coral}33, ${COLORS.coral}11)`,
    marginTop: '0.5rem',
    marginBottom: '-1rem',
    minHeight: '20px',
  },
  stopContent: { flexGrow: 1, minWidth: 0 },
  stopCard: {
    display: 'block',
    padding: 'clamp(1rem, 2.5vw, 1.4rem)',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '12px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    cursor: 'pointer',
  },
  stopHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.5rem',
    marginBottom: '0.6rem',
  },
  stopName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.15rem, 2.5vw, 1.4rem)',
    fontWeight: 600,
    margin: 0,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  stopCity: {
    fontSize: '0.78rem',
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
    flexShrink: 0,
  },
  stopNotes: {
    fontSize: '0.98rem',
    lineHeight: 1.6,
    color: '#444',
    margin: '0 0 0.75rem 0',
    fontStyle: 'italic',
  },
  stopTagline: {
    fontSize: '0.95rem',
    lineHeight: 1.55,
    color: '#555',
    margin: '0 0 0.75rem 0',
  },
  stopCta: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: COLORS.coral,
    letterSpacing: '0.02em',
  },

  markersSection: { marginBottom: '4rem' },
  markersHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: COLORS.ink,
  },
  markersSub: {
    fontSize: '1rem',
    color: COLORS.warmGray,
    marginBottom: '1.75rem',
    lineHeight: 1.5,
    maxWidth: '40rem',
  },
  markersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))',
    gap: '1rem',
  },
  markerCard: {
    padding: '1.1rem 1.25rem',
    background: COLORS.paper,
    borderRadius: '12px',
    borderLeft: `3px solid ${COLORS.violet}`,
  },
  markerEyebrow: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: COLORS.violet,
    marginBottom: '0.4rem',
  },
  markerName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: COLORS.ink,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
  markerNote: {
    fontSize: '0.92rem',
    lineHeight: 1.55,
    color: '#444',
    margin: '0 0 0.5rem 0',
  },
  markerMeta: {
    fontSize: '0.78rem',
    color: COLORS.warmGray,
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
