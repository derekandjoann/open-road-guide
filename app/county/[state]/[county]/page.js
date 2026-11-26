import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import MapView from '../../../../components/MapView';
import { thumbImage } from '../../../../lib/images';
import { snippet } from '../../../../lib/plainText';
import { countyLabel, COUNTY_INDEX_MIN } from '../../../../lib/county';

// County pages: /county/<state>/<county>, e.g. /county/texas/travis.
// Every place and historical marker in one county, with a map. Built on a
// visitor's first request, then cached and refreshed at most hourly.
export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BASE = 'https://openroadguide.com';
const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  paper: '#FFF8F0',
  warmGray: '#666',
};
const SERIF = "'Fraunces', Georgia, serif";

// One database read shared by the page and its metadata.
const getCounty = cache(async (state, county) => {
  const { data, error } = await supabase.rpc('county_page', {
    p_state_slug: state,
    p_county_slug: county,
  });
  if (error || !data || !data.county) return null;
  return data;
});

function summarize(d) {
  const told = (d.markers || []).filter((m) => m.slug);
  const untold = (d.markers || []).filter((m) => !m.slug);
  const label = countyLabel(d.county, d.state) || d.county;
  return { told, untold, label, places: d.places || [] };
}

function plural(n, one, many) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export async function generateMetadata({ params }) {
  const { state, county } = await params;
  const d = await getCounty(state, county);
  if (!d) return { title: { absolute: 'County not found | Open Road Guide' } };
  const { told, label, places } = summarize(d);
  const total = (d.markers || []).length;
  const url = `${BASE}/county/${state}/${county}`;
  const title = `${label}, ${d.state}: Places and Historical Markers | Open Road Guide`;
  const bits = [
    places.length ? plural(places.length, 'place', 'places') : null,
    total ? plural(total, 'historical marker', 'historical markers') : null,
  ].filter(Boolean);
  const description = `${bits.join(' and ')} in ${label}, ${d.state}, on one map, with the story behind each stop.`;
  const indexable = places.length + told.length >= COUNTY_INDEX_MIN;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url },
  };
}

export default async function CountyPage({ params }) {
  const { state, county } = await params;
  const d = await getCounty(state, county);
  if (!d) notFound();

  const { told, untold, label, places } = summarize(d);
  const pageUrl = `${BASE}/county/${state}/${county}`;

  // Towns, by how many stops each has.
  const townCounts = new Map();
  for (const x of [...places.map((p) => p.nearest_city), ...(d.markers || []).map((m) => m.city)]) {
    const t = (x || '').trim();
    if (t) townCounts.set(t, (townCounts.get(t) || 0) + 1);
  }
  const towns = [...townCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const mapPois = places
    .filter((p) => p.latitude != null)
    .map((p) => ({
      id: p.slug,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      category: p.category,
      tagline: p.tagline,
      href: `/poi/${p.slug}`,
    }));
  const mapMarkers = told
    .filter((m) => m.latitude != null)
    .map((m) => ({ name: m.name, latitude: m.latitude, longitude: m.longitude, href: `/marker/${m.slug}` }));

  const intro = [
    places.length ? plural(places.length, 'place to stop', 'places to stop') : null,
    (d.markers || []).length ? plural(d.markers.length, 'historical marker', 'historical markers') : null,
  ].filter(Boolean);

  // ---------- Structured data ----------
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${label}, ${d.state}`,
      url: pageUrl,
      about: { '@type': 'AdministrativeArea', name: `${label}, ${d.state}` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: places.length + told.length,
        itemListElement: [
          ...places.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/poi/${p.slug}`, name: p.name })),
          ...told.map((m, i) => ({ '@type': 'ListItem', position: places.length + i + 1, url: `${BASE}/marker/${m.slug}`, name: m.name })),
        ],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: d.state, item: `${BASE}/${d.state_slug}` },
        { '@type': 'ListItem', position: 3, name: label, item: pageUrl },
      ],
    },
  ];
  const ldHtml = JSON.stringify(ld).replace(/</g, '\\u003c');

  return (
    <main style={styles.main}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldHtml }} />

      <nav style={styles.breadcrumb}>
        <Link href="/" prefetch={false} style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <Link href={`/${d.state_slug}`} prefetch={false} style={styles.crumbLink}>{d.state}</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{label}</span>
      </nav>

      <header style={styles.hero}>
        <div style={styles.eyebrow}>County guide · {d.state}</div>
        <h1 style={styles.title}>{label}</h1>
        {intro.length > 0 && (
          <p style={styles.tagline}>
            {intro.join(' and ')} in {label}, {d.state}.
          </p>
        )}
        {towns.length > 1 && (
          <div style={styles.towns}>
            Towns: {towns.map(([t, n], i) => (
              <span key={t}>
                {i > 0 ? ', ' : ''}{t} ({n})
              </span>
            ))}
          </div>
        )}
      </header>

      {(mapPois.length > 0 || mapMarkers.length > 0) && (
        <section style={{ marginBottom: '2.5rem' }}>
          <MapView pois={mapPois} historicalMarkers={mapMarkers} height="440px" />
        </section>
      )}

      {places.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={styles.h2}>Places to stop</h2>
          <div style={styles.list}>
            {places.map((p) => (
              <Link key={p.slug} href={`/poi/${p.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.coral}` }}>
                {(p.thumbnail_public_id || p.thumbnail_url) && (
                  <img src={thumbImage(p, 160)} alt="" loading="lazy" style={styles.thumb} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...styles.cardEyebrow, color: COLORS.coral }}>
                    {[p.category, p.nearest_city].filter(Boolean).join(' · ')}
                  </div>
                  <div style={styles.cardTitle}>{p.name}</div>
                  {p.tagline && <div style={styles.cardSub}>{p.tagline}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {told.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={styles.h2}>Historical markers</h2>
          <div style={styles.list}>
            {told.map((m) => (
              <Link key={m.slug} href={`/marker/${m.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.violet}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...styles.cardEyebrow, color: COLORS.violet }}>
                    {[m.city, m.year_erected ? `Erected ${m.year_erected}` : null].filter(Boolean).join(' · ') || 'Historical marker'}
                  </div>
                  <div style={styles.cardTitle}>{m.name}</div>
                  {m.description && <div style={styles.cardSub}>{snippet(m.description, 170)}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {untold.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <details>
            <summary style={styles.summary}>
              {plural(untold.length, 'more marker', 'more markers')} in the county, story still to come
            </summary>
            <ul style={styles.untold}>
              {untold.map((m, i) => (
                <li key={`${m.name}-${i}`}>
                  {m.name}
                  {m.city ? <span style={{ color: COLORS.warmGray }}> · {m.city}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <nav style={styles.more}>
        <Link href={`/markers?state=${d.state_slug}`} prefetch={false} style={styles.moreLink}>
          Every county in {d.state} →
        </Link>
        <Link href={`/${d.state_slug}`} prefetch={false} style={styles.moreLink}>
          The {d.state} guide →
        </Link>
      </nav>
    </main>
  );
}

const styles = {
  main: {
    maxWidth: '52rem',
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
  hero: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: `3px solid ${COLORS.violet}` },
  eyebrow: {
    fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
    color: COLORS.violet, marginBottom: '0.6rem',
  },
  title: { fontFamily: SERIF, fontSize: 'clamp(2.3rem, 7vw, 3.8rem)', fontWeight: 600, margin: '0 0 0.8rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)', color: '#3a3a4e', margin: '0 0 0.8rem', lineHeight: 1.5 },
  towns: { fontSize: '0.9rem', color: COLORS.warmGray, lineHeight: 1.5 },
  h2: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600, margin: '0 0 1rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.7rem' },
  card: {
    display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.9rem 1.1rem', background: '#fff',
    border: '1px solid #ececec', borderRadius: '12px', textDecoration: 'none', color: COLORS.ink,
  },
  thumb: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  cardEyebrow: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: { fontSize: '0.9rem', color: '#555', lineHeight: 1.45, marginTop: '0.25rem' },
  summary: { cursor: 'pointer', fontWeight: 600, color: COLORS.violet, fontSize: '0.95rem' },
  untold: { marginTop: '0.75rem', paddingLeft: '1.2rem', lineHeight: 1.7, fontSize: '0.95rem', color: COLORS.ink },
  more: { display: 'flex', flexWrap: 'wrap', gap: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' },
  moreLink: { color: COLORS.coral, fontWeight: 600, textDecoration: 'none' },
};
