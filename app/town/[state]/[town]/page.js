import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import MapView from '../../../../components/MapView';
import { thumbImage } from '../../../../lib/images';
import { snippet } from '../../../../lib/plainText';
import { countyLabel } from '../../../../lib/county';
import { TOWN_INDEX_MIN, isTownName } from '../../../../lib/town';
import { shortName } from '../../../../lib/along';

// Town pages: /town/<state>/<town>, e.g. /town/utah/moab.
// The places and told historical markers filed under one town, with a map,
// its county guide and the highways through it. Towns with fewer than 3
// stops 404 (town_page returns null). Built on first request, refreshed hourly.
export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const BASE = 'https://openroadguide.com';
const COLORS = { coral: '#FF6B6B', teal: '#4ECDC4', yellow: '#FFD93D', violet: '#9D4EDD', ink: '#1a1a2e', warmGray: '#666' };
const SERIF = "'Fraunces', Georgia, serif";

const getTown = cache(async (state, town) => {
  if (!/^[a-z-]{2,40}$/.test(state) || !/^[a-z0-9-]{1,80}$/.test(town)) return null;
  const { data, error } = await supabase.rpc('town_page', { p_state_slug: state, p_town_slug: town });
  if (error || !data || !data.town || !isTownName(data.town)) return null;
  return data;
});

function plural(n, one, many) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function lede(d) {
  const bits = [
    d.places.length ? plural(d.places.length, 'place to stop', 'places to stop') : null,
    d.markers.length ? plural(d.markers.length, 'historical marker', 'historical markers') : null,
  ].filter(Boolean);
  return `${bits.join(' and ')} in and around ${d.town}, ${d.state}, on one map, with the story behind each stop.`;
}

export async function generateMetadata({ params }) {
  const { state, town } = await params;
  const d = await getTown(state, town);
  if (!d) return { title: { absolute: 'Town not found | Open Road Guide' } };
  const url = `${BASE}/town/${state}/${town}`;
  const title = `${d.town}, ${d.state}: Places and Historical Markers | Open Road Guide`;
  const description = lede(d);
  const indexable = d.places.length + d.markers.length >= TOWN_INDEX_MIN;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url, siteName: 'Open Road Guide' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function TownPage({ params }) {
  const { state, town } = await params;
  const d = await getTown(state, town);
  if (!d) notFound();

  const pageUrl = `${BASE}/town/${state}/${town}`;
  const county = d.county ? countyLabel(d.county, d.state) : null;
  const countyHref = d.county_slug ? `/county/${d.state_slug}/${d.county_slug}` : null;
  const nearHref = d.lat != null ? `/near?lat=${Number(d.lat).toFixed(4)}&lng=${Number(d.lng).toFixed(4)}&label=${encodeURIComponent(d.town)}` : null;

  const mapPois = d.places
    .filter((p) => p.latitude != null)
    .map((p) => ({
      id: p.slug,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      category: p.category,
      tagline: p.tagline,
      visit_duration: p.visit_duration,
      href: `/poi/${p.slug}`,
    }));
  const mapMarkers = d.markers.map((m) => ({
    name: m.name,
    latitude: m.latitude,
    longitude: m.longitude,
    year_erected: m.year_erected,
    href: `/marker/${m.slug}`,
  }));

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${d.town}, ${d.state}`,
      url: pageUrl,
      description: lede(d),
      about: { '@type': 'City', name: d.town, containedInPlace: { '@type': 'State', name: d.state } },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: d.places.length + d.markers.length,
        itemListElement: [
          ...d.places.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/poi/${p.slug}`, name: p.name })),
          ...d.markers.map((m, i) => ({ '@type': 'ListItem', position: d.places.length + i + 1, url: `${BASE}/marker/${m.slug}`, name: m.name })),
        ],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: d.state, item: `${BASE}/${d.state_slug}` },
        ...(county && countyHref ? [{ '@type': 'ListItem', position: 3, name: county, item: `${BASE}${countyHref}` }] : []),
        { '@type': 'ListItem', position: county && countyHref ? 4 : 3, name: d.town, item: pageUrl },
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
        {county && countyHref && (
          <>
            <span style={styles.crumbSep}>›</span>
            <Link href={countyHref} prefetch={false} style={styles.crumbLink}>{county}</Link>
          </>
        )}
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{d.town}</span>
      </nav>

      <header style={styles.hero}>
        <div style={styles.eyebrow}>Town guide · {d.state}</div>
        <h1 style={styles.title}>{d.town}</h1>
        <p style={styles.tagline}>{lede(d)}</p>
        {d.highways.length > 0 && (
          <div style={styles.hwys}>
            <span style={{ fontWeight: 600 }}>On the road:</span>
            {d.highways.map((h) => (
              <Link key={h.highway_slug} href={`/along/${h.highway_slug}/${d.state_slug}`} prefetch={false} style={styles.chip}>
                {shortName(h.highway_slug)}
              </Link>
            ))}
          </div>
        )}
      </header>

      {(mapPois.length > 0 || mapMarkers.length > 0) && (
        <section style={{ marginBottom: '2.5rem' }}>
          <MapView pois={mapPois} historicalMarkers={mapMarkers} height="420px" />
        </section>
      )}

      {d.places.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={styles.h2}>Places to stop</h2>
          <div style={styles.list}>
            {d.places.map((p) => (
              <Link key={p.slug} href={`/poi/${p.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.coral}` }}>
                {(p.thumbnail_public_id || p.thumbnail_url) && <img src={thumbImage(p, 160)} alt="" loading="lazy" style={styles.thumb} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...styles.cardEyebrow, color: COLORS.coral }}>
                    {[cap(p.category), p.visit_duration].filter(Boolean).join(' · ')}
                  </div>
                  <div style={styles.cardTitle}>{p.name}</div>
                  {p.tagline && <div style={styles.cardSub}>{p.tagline}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.markers.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={styles.h2}>Historical markers</h2>
          <div style={styles.list}>
            {d.markers.map((m) => (
              <Link key={m.slug} href={`/marker/${m.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.violet}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...styles.cardEyebrow, color: COLORS.violet }}>
                    {m.year_erected ? `Erected ${m.year_erected}` : 'Historical marker'}
                  </div>
                  <div style={styles.cardTitle}>{m.name}</div>
                  {m.description && <div style={styles.cardSub}>{snippet(m.description, 170)}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <nav style={styles.more}>
        {nearHref && <Link href={nearHref} prefetch={false} style={styles.moreLink}>Closest stops to {d.town} →</Link>}
        {county && countyHref && <Link href={countyHref} prefetch={false} style={styles.moreLink}>Everything in {county} →</Link>}
        <Link href={`/${d.state_slug}`} prefetch={false} style={styles.moreLink}>The {d.state} guide →</Link>
        <Link href="/plan" prefetch={false} style={styles.moreLink}>Chart My Course →</Link>
      </nav>
    </main>
  );
}

const styles = {
  main: { maxWidth: '52rem', margin: '0 auto', padding: 'clamp(1rem, 4vw, 2.5rem)', fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif", color: COLORS.ink },
  breadcrumb: { fontSize: '0.9rem', color: COLORS.warmGray, marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  crumbLink: { color: COLORS.warmGray, textDecoration: 'none' },
  crumbSep: { color: '#bbb' },
  crumbCurrent: { color: COLORS.ink, fontWeight: 500 },
  hero: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: `3px solid ${COLORS.coral}` },
  eyebrow: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.coral, marginBottom: '0.6rem' },
  title: { fontFamily: SERIF, fontSize: 'clamp(2.3rem, 7vw, 3.8rem)', fontWeight: 600, margin: '0 0 0.8rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)', color: '#3a3a4e', margin: '0 0 0.9rem', lineHeight: 1.5 },
  hwys: { display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', fontSize: '0.9rem', color: COLORS.warmGray },
  chip: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.25rem 0.7rem', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' },
  h2: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600, margin: '0 0 1rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.7rem' },
  card: { display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.9rem 1.1rem', background: '#fff', border: '1px solid #ececec', borderRadius: '12px', textDecoration: 'none', color: COLORS.ink },
  thumb: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  cardEyebrow: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: { fontSize: '0.9rem', color: '#555', lineHeight: 1.45, marginTop: '0.25rem' },
  more: { display: 'flex', flexWrap: 'wrap', gap: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' },
  moreLink: { color: COLORS.coral, fontWeight: 600, textDecoration: 'none' },
};
