import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import MapView from '../../../../components/MapView';
import { thumbImage } from '../../../../lib/images';
import { snippet } from '../../../../lib/plainText';
import { getCategoryColor } from '../../../../lib/categoryColors';
import { shortName, plural, planLinkFor } from '../../../../lib/along';

// Along the Way: one highway in one state, e.g. /along/i-70/utah.
// The places and told historical markers by the road, in the order a driver
// reaches them. Built on a visitor's first request, refreshed at most hourly.
export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const BASE = 'https://openroadguide.com';
const COLORS = { coral: '#FF6B6B', teal: '#4ECDC4', yellow: '#FFD93D', violet: '#9D4EDD', ink: '#1a1a2e', warmGray: '#666' };
const SERIF = "'Fraunces', Georgia, serif";

const getSegment = cache(async (highway, state) => {
  if (!/^(i|us)-[a-z0-9]{1,4}$/.test(highway) || !/^[a-z-]{2,40}$/.test(state)) return null;
  const { data, error } = await supabase.rpc('along_highway', { p_highway: highway, p_state_slug: state });
  if (error || !data) return null;
  return data;
});

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function lede(d) {
  const name = shortName(d.highway_slug);
  const ends =
    d.from_label && d.to_label ? `, from ${d.from_label} to ${d.to_label}` : '';
  const bits = [
    d.places.length ? plural(d.places.length, 'place to stop', 'places to stop') : null,
    d.markers.length ? plural(d.markers.length, 'historical marker', 'historical markers') : null,
  ].filter(Boolean);
  const head = `${name} runs about ${plural(Math.round(d.miles), 'mile', 'miles')} through ${d.state}${ends}.`;
  return bits.length ? `${head} Along it: ${bits.join(' and ')}, listed in the order you reach them heading ${d.direction.split(' ').pop()}.` : head;
}

export async function generateMetadata({ params }) {
  const { highway, state } = await params;
  const d = await getSegment(highway, state);
  if (!d) return { title: { absolute: 'Highway not found | Open Road Guide' } };
  const name = shortName(d.highway_slug);
  const url = `${BASE}/along/${highway}/${state}`;
  const title = `${name} in ${d.state}: Stops Along the Way | Open Road Guide`;
  const description = lede(d).slice(0, 300);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: d.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url, siteName: 'Open Road Guide' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function AlongSegmentPage({ params }) {
  const { highway, state } = await params;
  const d = await getSegment(highway, state);
  if (!d) notFound();

  const name = shortName(d.highway_slug);
  const pageUrl = `${BASE}/along/${highway}/${state}`;
  const planHref = planLinkFor(d);

  // Places and markers merged in road order.
  const stops = [
    ...d.places.map((p) => ({ ...p, kind: 'place' })),
    ...d.markers.map((m) => ({ ...m, kind: 'marker' })),
  ].sort((a, b) => a.at_mi - b.at_mi || (a.kind === 'place' ? -1 : 1));

  const mapPois = d.places.map((p) => ({
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

  const idx = d.others.findIndex((o) => o.state_slug === d.state_slug);
  const prev = idx > 0 ? d.others[idx - 1] : null;
  const next = idx >= 0 && idx < d.others.length - 1 ? d.others[idx + 1] : null;
  const crossing = d.crossing || [];

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${name} in ${d.state}`,
      url: pageUrl,
      description: lede(d),
      mainEntity: {
        '@type': 'ItemList',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: stops.length,
        itemListElement: stops.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.name,
          url: `${BASE}/${s.kind === 'place' ? 'poi' : 'marker'}/${s.slug}`,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Along the Way', item: `${BASE}/along` },
        { '@type': 'ListItem', position: 3, name, item: `${BASE}/along/${highway}` },
        { '@type': 'ListItem', position: 4, name: d.state, item: pageUrl },
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
        <Link href="/along" prefetch={false} style={styles.crumbLink}>Along the Way</Link>
        <span style={styles.crumbSep}>›</span>
        <Link href={`/along/${highway}`} prefetch={false} style={styles.crumbLink}>{name}</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{d.state}</span>
      </nav>

      <header style={styles.hero}>
        <div style={styles.eyebrow}>Along the Way · {d.highway_name}</div>
        <h1 style={styles.title}>
          {name} in {d.state}
        </h1>
        <p style={styles.tagline}>{lede(d)}</p>
        {planHref && (
          <Link href={planHref} prefetch={false} style={styles.btn}>
            Plan this drive →
          </Link>
        )}
      </header>

      <section style={{ marginBottom: '2.5rem' }}>
        <MapView pois={mapPois} historicalMarkers={mapMarkers} routeLine={d.line} height="440px" />
        <div style={styles.credit}>
          Road line from the Census Bureau&apos;s TIGER roads and OpenStreetMap. Miles count from {d.from_label || 'the start'}; they
          are this guide&apos;s distances, not the posted mileposts.
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={styles.h2}>
          Stop by stop, {d.direction}
        </h2>
        {stops.length === 0 && <p style={styles.cardSub}>No places or told markers along this stretch in the guide yet.</p>}
        <ol style={styles.list}>
          {stops.map((s) => {
            const color = s.kind === 'marker' ? COLORS.violet : getCategoryColor(s.category);
            const href = s.kind === 'place' ? `/poi/${s.slug}` : `/marker/${s.slug}`;
            const off = s.off_mi < 0.3 ? 'by the road' : `${s.off_mi} mi off the road`;
            return (
              <li key={`${s.kind}-${s.slug}`} style={{ listStyle: 'none' }}>
                <Link href={href} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${color}` }}>
                  <div style={styles.mile}>
                    <div style={styles.mileNum}>{s.at_mi}</div>
                    <div style={styles.mileLbl}>mile</div>
                  </div>
                  {s.kind === 'place' && (s.thumbnail_public_id || s.thumbnail_url) && (
                    <img src={thumbImage(s, 160)} alt="" loading="lazy" style={styles.thumb} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...styles.cardEyebrow, color }}>
                      {s.kind === 'place'
                        ? [cap(s.category), s.nearest_city].filter(Boolean).join(' · ')
                        : [s.city, s.year_erected ? `Erected ${s.year_erected}` : null].filter(Boolean).join(' · ') || 'Historical marker'}
                    </div>
                    <div style={styles.cardTitle}>{s.name}</div>
                    {s.kind === 'place' && s.tagline && <div style={styles.cardSub}>{s.tagline}</div>}
                    {s.kind === 'marker' && s.teaser && <div style={styles.cardSub}>{snippet(s.teaser, 150)}</div>}
                    <div style={styles.off}>{off}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {(prev || next || d.others.length > 1) && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={styles.h3}>{name} in other states</h2>
          <div style={styles.chips}>
            {d.others.map((o) =>
              o.state_slug === d.state_slug ? (
                <span key={o.state_slug} style={{ ...styles.chip, background: COLORS.ink, color: '#fff' }}>{o.state}</span>
              ) : (
                <Link key={o.state_slug} href={`/along/${highway}/${o.state_slug}`} prefetch={false} style={styles.chip}>
                  {o.state}
                </Link>
              )
            )}
          </div>
        </section>
      )}

      {crossing.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={styles.h3}>Highways it meets in {d.state}</h2>
          <div style={styles.chips}>
            {crossing.map((c) => (
              <Link key={c.highway_slug} href={`/along/${c.highway_slug}/${d.state_slug}`} prefetch={false} style={styles.chip}>
                {shortName(c.highway_slug)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <nav style={styles.more}>
        <Link href={`/${d.state_slug}`} prefetch={false} style={styles.moreLink}>The {d.state} guide →</Link>
        <Link href="/along" prefetch={false} style={styles.moreLink}>Every highway →</Link>
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
  hero: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: `3px solid ${COLORS.teal}` },
  eyebrow: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2a9d94', marginBottom: '0.6rem' },
  title: { fontFamily: SERIF, fontSize: 'clamp(2.3rem, 7vw, 3.8rem)', fontWeight: 600, margin: '0 0 0.8rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)', color: '#3a3a4e', margin: '0 0 1.2rem', lineHeight: 1.5 },
  btn: { display: 'inline-block', background: COLORS.ink, color: '#fff', borderRadius: '999px', padding: '0.7rem 1.3rem', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' },
  credit: { fontSize: '0.8rem', color: COLORS.warmGray, marginTop: '0.5rem', lineHeight: 1.45 },
  h2: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600, margin: '0 0 1rem' },
  h3: { fontFamily: SERIF, fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.7rem', padding: 0, margin: 0 },
  card: { display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.9rem 1.1rem', background: '#fff', border: '1px solid #ececec', borderRadius: '12px', textDecoration: 'none', color: COLORS.ink },
  mile: { flex: '0 0 auto', width: '3rem', textAlign: 'center' },
  mileNum: { fontFamily: SERIF, fontSize: '1.3rem', fontWeight: 600, lineHeight: 1 },
  mileLbl: { fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.warmGray },
  thumb: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  cardEyebrow: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.12rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: { fontSize: '0.9rem', color: '#555', lineHeight: 1.45, marginTop: '0.25rem' },
  off: { fontSize: '0.78rem', fontWeight: 600, color: COLORS.warmGray, marginTop: '0.3rem' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  chip: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.4rem 0.9rem', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none' },
  more: { display: 'flex', flexWrap: 'wrap', gap: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' },
  moreLink: { color: COLORS.coral, fontWeight: 600, textDecoration: 'none' },
};
