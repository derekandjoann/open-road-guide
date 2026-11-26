import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { shortName, highwayOrder } from '../../lib/along';

// Along the Way hub: every interstate and US highway in the guide, by state.
export const revalidate = 3600;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BASE = 'https://openroadguide.com';
const COLORS = { coral: '#FF6B6B', teal: '#4ECDC4', ink: '#1a1a2e', warmGray: '#666' };
const SERIF = "'Fraunces', Georgia, serif";

const TITLE = 'Along the Way: Interstates and US Highways, State by State | Open Road Guide';
const DESC =
  'Pick a highway and a state and see the places and historical markers by the road, in the order you reach them, with a map and a ready-made trip plan.';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: `${BASE}/along` },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: `${BASE}/along`, siteName: 'Open Road Guide' },
  twitter: { card: 'summary', title: TITLE, description: DESC },
};

export default async function AlongHub() {
  const { data } = await supabase.rpc('highway_directory');
  const segs = Array.isArray(data) ? data : [];

  // Highways, each with its states in road order.
  const byHighway = new Map();
  for (const s of segs) {
    if (!byHighway.has(s.highway_slug)) byHighway.set(s.highway_slug, { ...s, states: [] });
    byHighway.get(s.highway_slug).states.push(s);
  }
  const highways = [...byHighway.values()].sort(highwayOrder);
  const interstates = highways.filter((h) => h.kind === 'interstate');
  const usRoutes = highways.filter((h) => h.kind === 'us');

  // States, each with its highways.
  const byState = new Map();
  for (const s of segs) {
    if (!byState.has(s.state)) byState.set(s.state, { state: s.state, state_slug: s.state_slug, segs: [] });
    byState.get(s.state).segs.push(s);
  }
  const states = [...byState.values()].sort((a, b) => a.state.localeCompare(b.state));

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Along the Way', item: `${BASE}/along` },
    ],
  };

  const group = (list) =>
    list.map((h) => (
      <div key={h.highway_slug} style={styles.row}>
        <Link href={`/along/${h.highway_slug}`} prefetch={false} style={styles.hwy}>
          {shortName(h.highway_slug)}
        </Link>
        <div style={styles.chips}>
          {h.states.map((s) => (
            <Link key={s.state_slug} href={`/along/${h.highway_slug}/${s.state_slug}`} prefetch={false} style={styles.chip}>
              {s.state}
            </Link>
          ))}
        </div>
      </div>
    ));

  return (
    <main style={styles.main}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Along the Way</div>
        <h1 style={styles.title}>Highways, state by state</h1>
        <p style={styles.tagline}>
          Pick a highway and a state for the places and historical markers by the road, in the order you reach them. To plan a trip
          of your own between two towns, use <Link href="/plan" prefetch={false} style={{ color: COLORS.coral }}>Chart My Course</Link>.
        </p>
      </header>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={styles.h2}>By state</h2>
        <div style={styles.chips}>
          {states.map((s) => (
            <a key={s.state_slug} href={`#${s.state_slug}`} style={styles.chip}>
              {s.state}
            </a>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={styles.h2}>Interstates</h2>
        {group(interstates)}
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={styles.h2}>US highways</h2>
        {group(usRoutes)}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        {states.map((s) => (
          <div key={s.state_slug} id={s.state_slug} style={{ ...styles.row, scrollMarginTop: '7rem' }}>
            <Link href={`/${s.state_slug}`} prefetch={false} style={styles.hwy}>
              {s.state}
            </Link>
            <div style={styles.chips}>
              {[...s.segs].sort(highwayOrder).map((g) => (
                <Link key={g.highway_slug} href={`/along/${g.highway_slug}/${s.state_slug}`} prefetch={false} style={styles.chip}>
                  {shortName(g.highway_slug)}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

const styles = {
  main: { maxWidth: '52rem', margin: '0 auto', padding: 'clamp(1rem, 4vw, 2.5rem)', fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif", color: COLORS.ink },
  hero: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: `3px solid ${COLORS.teal}` },
  eyebrow: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2a9d94', marginBottom: '0.6rem' },
  title: { fontFamily: SERIF, fontSize: 'clamp(2.3rem, 7vw, 3.8rem)', fontWeight: 600, margin: '0 0 0.8rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)', color: '#3a3a4e', margin: 0, lineHeight: 1.5 },
  h2: { fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 600, margin: '0 0 1rem' },
  row: { display: 'flex', gap: '1rem', alignItems: 'baseline', padding: '0.7rem 0', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' },
  hwy: { fontFamily: SERIF, fontWeight: 600, fontSize: '1.15rem', color: COLORS.ink, textDecoration: 'none', minWidth: '5.5rem' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', flex: 1 },
  chip: { background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.3rem 0.75rem', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' },
};
