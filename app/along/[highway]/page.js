import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { shortName, plural } from '../../../lib/along';

// One highway, state by state, e.g. /along/i-70.
export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BASE = 'https://openroadguide.com';
const COLORS = { coral: '#FF6B6B', teal: '#4ECDC4', violet: '#9D4EDD', ink: '#1a1a2e', warmGray: '#666' };
const SERIF = "'Fraunces', Georgia, serif";

const getDirectory = cache(async () => {
  const { data, error } = await supabase.rpc('highway_directory');
  if (error || !Array.isArray(data)) return [];
  return data;
});

async function getHighway(highway) {
  if (!/^(i|us)-[a-z0-9]{1,4}$/.test(highway)) return null;
  const segs = (await getDirectory()).filter((s) => s.highway_slug === highway);
  return segs.length ? segs : null;
}

export async function generateMetadata({ params }) {
  const { highway } = await params;
  const segs = await getHighway(highway);
  if (!segs) return { title: { absolute: 'Highway not found | Open Road Guide' } };
  const name = shortName(highway);
  const miles = segs.reduce((n, s) => n + Number(s.miles), 0);
  const stops = segs.reduce((n, s) => n + s.places_n + s.markers_n, 0);
  const url = `${BASE}/along/${highway}`;
  const title = `${name}: Stops Along the Way, State by State | Open Road Guide`;
  const description = `${name} through ${plural(segs.length, 'state', 'states')} in this guide: about ${plural(Math.round(miles), 'mile', 'miles')} and ${plural(stops, 'place and marker', 'places and markers')} to stop at, in road order.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: segs.some((s) => s.indexable) ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url, siteName: 'Open Road Guide' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function HighwayPage({ params }) {
  const { highway } = await params;
  const segs = await getHighway(highway);
  if (!segs) notFound();
  const name = shortName(highway);
  const full = segs[0].highway_name;
  const dir = segs[0].direction;
  const url = `${BASE}/along/${highway}`;

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${name}, state by state`,
      url,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: segs.length,
        itemListElement: segs.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: `${name} in ${s.state}`, url: `${BASE}/along/${highway}/${s.state_slug}` })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Along the Way', item: `${BASE}/along` },
        { '@type': 'ListItem', position: 3, name, item: url },
      ],
    },
  ];

  return (
    <main style={styles.main}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <nav style={styles.breadcrumb}>
        <Link href="/" prefetch={false} style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <Link href="/along" prefetch={false} style={styles.crumbLink}>Along the Way</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{name}</span>
      </nav>
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Along the Way · {full}</div>
        <h1 style={styles.title}>{name}, state by state</h1>
        <p style={styles.tagline}>
          {name} through the {plural(segs.length, 'state', 'states')} this guide covers, {dir}. Open a state for its places and
          historical markers in the order you reach them.
        </p>
      </header>
      <ol style={styles.list}>
        {segs.map((s) => (
          <li key={s.state_slug} style={{ listStyle: 'none' }}>
            <Link href={`/along/${highway}/${s.state_slug}`} prefetch={false} style={styles.card}>
              <div style={styles.cardTitle}>{s.state}</div>
              <div style={styles.cardSub}>
                About {plural(Math.round(Number(s.miles)), 'mile', 'miles')}
                {s.from_label && s.to_label ? `, ${s.from_label} to ${s.to_label}` : ''}
              </div>
              <div style={styles.counts}>
                {plural(s.places_n, 'place', 'places')} · {plural(s.markers_n, 'marker', 'markers')}
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <nav style={styles.more}>
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
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)', color: '#3a3a4e', margin: 0, lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column', gap: '0.7rem', padding: 0, margin: '0 0 2rem' },
  card: { display: 'block', padding: '0.9rem 1.1rem', background: '#fff', border: '1px solid #ececec', borderLeft: `4px solid ${COLORS.teal}`, borderRadius: '12px', textDecoration: 'none', color: COLORS.ink },
  cardTitle: { fontFamily: SERIF, fontSize: '1.2rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: { fontSize: '0.92rem', color: '#555', lineHeight: 1.45, marginTop: '0.25rem' },
  counts: { fontSize: '0.8rem', fontWeight: 600, color: COLORS.warmGray, marginTop: '0.3rem' },
  more: { display: 'flex', flexWrap: 'wrap', gap: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' },
  moreLink: { color: COLORS.coral, fontWeight: 600, textDecoration: 'none' },
};
