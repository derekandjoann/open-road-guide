import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import MarkerMap from './MarkerMap';

// Render every marker page on demand (server-side) rather than statically at
// build time, matching the POI and route pages. Marker descriptions land in
// Supabase daily as the writing campaign rolls — a described marker's page
// exists the moment its prose does, with no deploy.
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  paper: '#FFF8F0',
  warmGray: '#666',
};

const BASE = 'https://openroadguide.com';

// Only markers that carry an editorial description get pages — the quality
// bar is the point. Everything else stays map-only.
async function fetchMarkerBySlug(slug, columns = '*') {
  const { data } = await supabase
    .from('markers')
    .select(columns)
    .eq('slug', slug)
    .not('description', 'is', null)
    .neq('description', '')
    .maybeSingle();

  return data || null;
}

function stateSlug(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '-');
}

// The display number comes from external_id ("ID|lat|lon"). The bare ID is
// not unique across markers, which is exactly why it's display-only.
function markerNumber(externalId) {
  const num = (externalId || '').split('|')[0];
  return num && /^\d+$/.test(num) ? num : null;
}

// Distance between two coordinates in miles (haversine) — close enough for
// "how far is the detour" purposes, which is all the nearby sections need.
function milesBetween(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtMiles(mi) {
  if (mi < 0.2) return 'steps away';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

// Server-rendered metadata: real per-marker <title>/<meta>/Open Graph tags
// and canonical, shipped in the initial HTML for crawlers.
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const marker = await fetchMarkerBySlug(slug, 'name, description, state');

  if (!marker) {
    return { title: { absolute: 'Marker not found | Open Road Guide' } };
  }

  const title = `${marker.name} — ${marker.state} Historical Marker | Open Road Guide`;
  const description = (marker.description || '').slice(0, 155);
  const url = `${BASE}/marker/${slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
    },
  };
}

export default async function MarkerPage({ params }) {
  const { slug } = await params;

  const marker = await fetchMarkerBySlug(slug);

  if (!marker) {
    return (
      <main style={styles.main}>
        <div style={styles.notFound}>
          <h1 style={styles.notFoundTitle}>Marker not found</h1>
          <p>We haven&apos;t written up a marker at &ldquo;{slug}&rdquo; yet.</p>
          <Link href="/markers" style={styles.link}>
            ← Browse all historical markers
          </Link>
        </div>
      </main>
    );
  }

  const num = markerNumber(marker.external_id);
  const hasCoords =
    typeof marker.latitude === 'number' && typeof marker.longitude === 'number';
  const stSlug = stateSlug(marker.state);
  const locationBits = [
    marker.city,
    marker.county ? `${marker.county} County` : null,
  ]
    .filter(Boolean)
    .join(', ');

  // ---------- Nearby content ----------
  // A bounding box (~25 miles each way) narrows the candidates; exact
  // distances are computed here and the closest few win. Nearby markers link
  // only to markers that have pages of their own (described + slugged).
  let nearbyPois = [];
  let nearbyMarkers = [];

  if (hasCoords) {
    const dLat = 0.36;
    const dLng = 0.46;

    const [poiRes, markerRes] = await Promise.all([
      supabase
        .from('pois')
        .select('name, slug, category, tagline, latitude, longitude')
        .eq('published', true)
        .gte('latitude', marker.latitude - dLat)
        .lte('latitude', marker.latitude + dLat)
        .gte('longitude', marker.longitude - dLng)
        .lte('longitude', marker.longitude + dLng),
      supabase
        .from('markers')
        .select('name, slug, latitude, longitude')
        .neq('id', marker.id)
        .not('description', 'is', null)
        .neq('description', '')
        .not('slug', 'is', null)
        .gte('latitude', marker.latitude - dLat)
        .lte('latitude', marker.latitude + dLat)
        .gte('longitude', marker.longitude - dLng)
        .lte('longitude', marker.longitude + dLng),
    ]);

    const withMiles = (rows) =>
      (rows || [])
        .filter(
          (r) => typeof r.latitude === 'number' && typeof r.longitude === 'number'
        )
        .map((r) => ({
          ...r,
          miles: milesBetween(
            marker.latitude,
            marker.longitude,
            r.latitude,
            r.longitude
          ),
        }))
        .sort((a, b) => a.miles - b.miles);

    nearbyPois = withMiles(poiRes.data).slice(0, 4);
    nearbyMarkers = withMiles(markerRes.data).slice(0, 4);
  }

  // Split the editorial description into paragraphs, mirroring the POI and
  // story renderers.
  const descriptionBlocks = (marker.description || '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  // ---------- Structured data (JSON-LD) ----------
  // Ships in the server-rendered HTML. A TouristAttraction describes the
  // marker site (with geo + locality where we have them); a BreadcrumbList
  // mirrors the on-page Home › Markers › Marker trail. Only fields we
  // actually have are emitted — no empty or guessed values.
  const pageUrl = `${BASE}/marker/${slug}`;

  const attractionLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: marker.name,
    description: marker.description,
    url: pageUrl,
  };
  if (hasCoords) {
    attractionLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: marker.latitude,
      longitude: marker.longitude,
    };
  }
  const address = {};
  if (marker.city) address.addressLocality = marker.city;
  if (marker.state) address.addressRegion = marker.state;
  if (Object.keys(address).length > 0) {
    attractionLd.address = {
      '@type': 'PostalAddress',
      ...address,
      addressCountry: 'US',
    };
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Markers', item: `${BASE}/markers` },
      { '@type': 'ListItem', position: 3, name: marker.name, item: pageUrl },
    ],
  };

  // Escape "<" so prose containing "</script>" can't break out of the tag.
  const jsonLdHtml = JSON.stringify([attractionLd, breadcrumbLd]).replace(
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

      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <Link href="/markers" style={styles.crumbLink}>
          Markers
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{marker.name}</span>
      </nav>

      {/* Title block */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>
          Historical Marker{num ? ` · No. ${num}` : ''}
        </div>
        <h1 style={styles.title}>{marker.name}</h1>
        <div style={styles.metaLine}>
          {locationBits && <>{locationBits} · </>}
          <Link href={`/${stSlug}`} style={styles.stateLink}>
            {marker.state}
          </Link>
        </div>
        {(marker.erected_by || marker.year_erected) && (
          <div style={styles.erectedLine}>
            Erected
            {marker.erected_by ? ` by ${marker.erected_by}` : ''}
            {marker.year_erected ? `, ${marker.year_erected}` : ''}
          </div>
        )}
      </header>

      {/* The editorial description — the reason this page exists */}
      <section style={styles.section}>
        {descriptionBlocks.map((p, i) => (
          <p key={i} style={styles.bodyText}>
            {p}
          </p>
        ))}
      </section>

      {/* The plaque's own text */}
      {marker.inscription && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>What the plaque says</h2>
          <blockquote style={styles.inscription}>{marker.inscription}</blockquote>
        </section>
      )}

      {/* Map */}
      {hasCoords && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Where it stands</h2>
          <MarkerMap
            marker={{
              name: marker.name,
              latitude: marker.latitude,
              longitude: marker.longitude,
              category: 'Historical marker',
              tagline: locationBits || marker.state,
            }}
          />
          <div style={styles.coordsLine}>
            {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
            {' · '}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${marker.latitude},${marker.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Directions
            </a>
          </div>
        </section>
      )}

      {/* Nearby places */}
      {nearbyPois.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Worth the stop nearby</h2>
          <ul style={styles.nearbyList}>
            {nearbyPois.map((p) => (
              <li key={p.slug} style={styles.nearbyItem}>
                <Link href={`/poi/${p.slug}`} style={styles.nearbyLink}>
                  {p.name}
                </Link>
                <span style={styles.nearbyMiles}> — {fmtMiles(p.miles)}</span>
                {p.tagline && <div style={styles.nearbyTagline}>{p.tagline}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nearby markers with pages of their own */}
      {nearbyMarkers.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>More markers nearby</h2>
          <ul style={styles.nearbyList}>
            {nearbyMarkers.map((m) => (
              <li key={m.slug} style={styles.nearbyItem}>
                <Link href={`/marker/${m.slug}`} style={styles.nearbyLink}>
                  {m.name}
                </Link>
                <span style={styles.nearbyMiles}> — {fmtMiles(m.miles)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Source credit */}
      {marker.source_url && (
        <footer style={styles.sourceLine}>
          Marker record:{' '}
          <a
            href={marker.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            {marker.source || 'source'}
          </a>
        </footer>
      )}

      <div style={styles.backRow}>
        <Link href="/markers" style={styles.link}>
          ← All historical markers
        </Link>
      </div>
    </main>
  );
}

const styles = {
  main: {
    maxWidth: '46rem',
    margin: '0 auto',
    padding: 'clamp(1rem, 4vw, 2.5rem)',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.ink,
  },

  notFound: { textAlign: 'center', padding: '5rem 1rem' },
  notFoundTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '2rem',
    marginBottom: '1rem',
  },
  link: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600 },

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
    marginBottom: '2.5rem',
    paddingBottom: '1.75rem',
    borderBottom: `3px solid ${COLORS.violet}`,
  },
  eyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.violet,
    marginBottom: '0.75rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(2rem, 6vw, 3.25rem)',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    lineHeight: 1.08,
    color: COLORS.ink,
  },
  metaLine: {
    fontSize: '1rem',
    color: COLORS.warmGray,
    marginBottom: '0.35rem',
  },
  stateLink: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600 },
  erectedLine: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: COLORS.warmGray,
  },

  section: { marginBottom: '2.75rem' },
  sectionHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.35rem, 3.5vw, 1.8rem)',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    color: COLORS.ink,
  },
  bodyText: {
    fontSize: '1.08rem',
    lineHeight: 1.75,
    margin: '0 0 1.25rem 0',
    color: '#2a2a3e',
  },
  inscription: {
    margin: 0,
    padding: '1.25rem 1.5rem',
    borderLeft: `3px solid ${COLORS.violet}`,
    background: 'rgba(157, 77, 221, 0.06)',
    borderRadius: '0 12px 12px 0',
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.02rem',
    lineHeight: 1.7,
    color: '#2a2a3e',
    whiteSpace: 'pre-line',
  },
  coordsLine: {
    fontSize: '0.85rem',
    color: COLORS.warmGray,
    marginTop: '0.6rem',
  },

  nearbyList: { listStyle: 'none', margin: 0, padding: 0 },
  nearbyItem: {
    padding: '0.85rem 0',
    borderBottom: '1px solid rgba(26,26,46,0.08)',
  },
  nearbyLink: {
    color: COLORS.ink,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '1.02rem',
  },
  nearbyMiles: { color: COLORS.warmGray, fontSize: '0.9rem' },
  nearbyTagline: {
    fontSize: '0.9rem',
    color: COLORS.warmGray,
    marginTop: '0.2rem',
    lineHeight: 1.45,
  },

  sourceLine: {
    fontSize: '0.8rem',
    color: COLORS.warmGray,
    marginBottom: '2rem',
    fontStyle: 'italic',
  },
  backRow: { marginTop: '1rem' },
};
