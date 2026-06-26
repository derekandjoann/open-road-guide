import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import MapView from '../components/MapView';
import MapLegend from '../components/MapLegend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function heroSrc(url, width = 1200) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  paper: '#FFF8F0',
  warmGray: '#666',
};

export const metadata = {
  title: { absolute: 'Open Road Guide — Road Trip Guides to the American West' },
  description:
    'Field-tested road trip guides to the American West — the parks, ghost towns, scenic drives, and roadside stories most maps leave out. Pick a state and start exploring.',
  alternates: { canonical: 'https://openroadguide.com' },
  openGraph: {
    title: 'Open Road Guide — Road Trip Guides to the American West',
    description:
      'Pick a state and start exploring — the parks, ghost towns, scenic drives, and roadside stories most maps leave out.',
    type: 'website',
    url: 'https://openroadguide.com',
  },
};

export default async function HomePage() {
  const [stateRes, poiRes] = await Promise.all([
    supabase
      .from('states')
      .select('*')
      .eq('published', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('pois')
      .select('id, name, slug, tagline, category, longitude, latitude')
      .eq('published', true),
  ]);

  const states = stateRes.data || [];
  const liveStates = states.filter((s) => s.status === 'live');
  const pois = (poiRes.data || []).filter(
    (p) => typeof p.longitude === 'number' && typeof p.latitude === 'number'
  );
  const categories = [...new Set(pois.map((p) => p.category).filter(Boolean))].sort();

  const statBits = [
    liveStates.length > 0 && `${liveStates.length} ${liveStates.length === 1 ? 'state' : 'states'}`,
    pois.length > 0 && `${pois.length} places`,
    categories.length > 0 && `${categories.length} categories`,
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: COLORS.ink }}>
      {/* ===== HERO ===== */}
      <section style={hero.section}>
        <div style={hero.roadLines} />
        <div style={hero.orb} />
        <div style={hero.inner}>
          <div style={hero.badge}>
            <span style={{ fontSize: '14px' }}>🛣️</span>
            <span style={hero.badgeText}>Guides to the American West</span>
          </div>

          <h1 style={hero.title}>
            Your road trip starts{' '}
            <span style={hero.titleAccent}>here</span>.
          </h1>

          <p style={hero.sub}>
            Field-tested guides to the American West — the parks, the ghost towns, the
            scenic drives, and the roadside stories most maps leave out. Pick a state
            below and start exploring.
          </p>

          <div style={hero.ctaRow}>
            <a href="#states" style={hero.ctaPrimary}>Choose a state</a>
            <a href="/explore" style={hero.ctaGhost}>Browse every stop</a>
          </div>

          {statBits.length > 0 && (
            <div style={hero.statLine}>{statBits.join('  ·  ')}</div>
          )}
        </div>
      </section>

      {/* ===== STATE CHOOSER ===== */}
      <section id="states" style={chooser.section}>
        <div style={chooser.head}>
          <h2 style={chooser.heading}>Where are you headed?</h2>
          <p style={chooser.sub}>
            Each state is its own guide — its regions, its drives, its stories, mapped end to end.
          </p>
        </div>

        <div style={chooser.grid}>
          {states.map((s) => (
            <StateCard key={s.id} state={s} />
          ))}
        </div>
      </section>

      {/* ===== NATIONAL MAP ===== */}
      {pois.length > 0 && (
        <section style={mapBlock.section}>
          <div style={mapBlock.head}>
            <h2 style={mapBlock.heading}>Or just browse the whole map</h2>
            <p style={mapBlock.sub}>Every stop we&apos;ve mapped so far. Tap any dot to see what makes it worth pulling over.</p>
          </div>
          {categories.length > 0 && (
            <div style={mapBlock.legendWrap}>
              <MapLegend categories={categories} />
            </div>
          )}
          <div style={mapBlock.mapWrap}>
            <MapView pois={pois} height="540px" />
          </div>
        </section>
      )}
    </div>
  );
}

// ---- State card ----

function StateCard({ state }) {
  const comingSoon = state.status !== 'live';

  const inner = (
    <>
      <div style={card.imageWrap}>
        {state.hero_image_url ? (
          <img
            src={heroSrc(state.hero_image_url, 800)}
            alt={state.name}
            loading="lazy"
            style={{ ...card.image, filter: comingSoon ? 'grayscale(0.7) brightness(0.8)' : 'none' }}
          />
        ) : (
          <div style={{ ...card.image, background: 'linear-gradient(135deg,#1a1a2e,#0f3460)' }} />
        )}
        <div style={card.imageScrim} />
        <div style={card.stateName}>{state.name}</div>
        {comingSoon && <div style={card.soonBadge}>Coming soon</div>}
      </div>
      <div style={card.body}>
        {state.tagline && <p style={card.tagline}>{state.tagline}</p>}
        {!comingSoon && <div style={card.cta}>Explore {state.name} →</div>}
      </div>
    </>
  );

  if (comingSoon) {
    return <div style={{ ...card.card, cursor: 'default', opacity: 0.85 }}>{inner}</div>;
  }
  return (
    <Link href={`/${state.slug}`} style={card.card}>
      {inner}
    </Link>
  );
}

// ---- Styles ----

const hero = {
  section: {
    position: 'relative',
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    minHeight: '72vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  roadLines: {
    position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none',
    background: 'repeating-linear-gradient(90deg, transparent, transparent 48%, #ffb627 48%, #ffb627 52%, transparent 52%)',
  },
  orb: {
    position: 'absolute', width: '400px', height: '400px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,107,91,0.15) 0%, transparent 70%)',
    top: '-100px', right: '-50px', pointerEvents: 'none',
  },
  inner: { position: 'relative', zIndex: 2, maxWidth: '900px', margin: '0 auto', padding: '64px 28px 72px', textAlign: 'center' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    background: 'rgba(255,182,39,0.15)', border: '1px solid rgba(255,182,39,0.3)',
    borderRadius: '20px', padding: '6px 16px', marginBottom: '28px',
  },
  badgeText: { fontSize: '13px', fontWeight: 600, color: '#ffb627', textTransform: 'uppercase', letterSpacing: '1px' },
  title: {
    fontFamily: "'Fraunces', serif", fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900,
    color: '#fff', lineHeight: 1.1, marginBottom: '20px',
  },
  titleAccent: { background: 'linear-gradient(135deg, #ff6b5b, #ffb627)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  sub: { fontSize: 'clamp(16px, 2.5vw, 20px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, maxWidth: '620px', margin: '0 auto 36px' },
  ctaRow: { display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' },
  ctaPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 32px',
    background: 'linear-gradient(135deg, #ff6b5b, #ff8a7d)', color: '#fff',
    fontWeight: 700, fontSize: '16px', borderRadius: '12px', textDecoration: 'none',
    boxShadow: '0 4px 20px rgba(255,107,91,0.4)',
  },
  ctaGhost: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 32px',
    background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)',
    color: '#fff', fontWeight: 600, fontSize: '16px', borderRadius: '12px', textDecoration: 'none',
  },
  statLine: { marginTop: '40px', fontSize: '13px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 500 },
};

const chooser = {
  section: { padding: 'clamp(3rem, 7vw, 5rem) 28px', background: COLORS.paper, maxWidth: '1100px', margin: '0 auto' },
  head: { textAlign: 'center', maxWidth: '40rem', margin: '0 auto 2.5rem' },
  heading: { fontFamily: "'Fraunces', serif", fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, margin: '0 0 0.5rem 0', color: COLORS.ink },
  sub: { fontSize: '1.05rem', color: COLORS.warmGray, lineHeight: 1.55, margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.75rem' },
};

const card = {
  card: {
    display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '18px',
    overflow: 'hidden', textDecoration: 'none', color: 'inherit',
    border: '1px solid #ececec', boxShadow: '0 6px 24px rgba(26,26,46,0.08)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  imageWrap: { position: 'relative', width: '100%', aspectRatio: '16 / 10', overflow: 'hidden', background: '#1a1a2e' },
  image: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  imageScrim: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)' },
  stateName: {
    position: 'absolute', left: '20px', bottom: '14px', color: '#fff',
    fontFamily: "'Fraunces', serif", fontWeight: 800, fontSize: 'clamp(28px, 4vw, 38px)',
    textShadow: '0 2px 12px rgba(0,0,0,0.5)', letterSpacing: '-0.01em',
  },
  soonBadge: {
    position: 'absolute', top: '14px', right: '14px', background: 'rgba(255,255,255,0.92)',
    color: COLORS.ink, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', padding: '0.3rem 0.7rem', borderRadius: '999px',
  },
  body: { display: 'flex', flexDirection: 'column', padding: 'clamp(1.25rem, 3vw, 1.6rem)', flexGrow: 1 },
  tagline: { fontSize: '1rem', lineHeight: 1.55, color: '#3a3a4e', margin: '0 0 1rem 0', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif", flexGrow: 1 },
  cta: { fontSize: '0.95rem', fontWeight: 700, color: COLORS.coral, letterSpacing: '0.01em', marginTop: 'auto' },
};

const mapBlock = {
  section: { padding: 'clamp(3rem, 6vw, 4.5rem) 28px', background: '#fff' },
  head: { textAlign: 'center', maxWidth: '40rem', margin: '0 auto 1.5rem' },
  heading: { fontFamily: "'Fraunces', serif", fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, margin: '0 0 0.4rem 0', color: COLORS.ink },
  sub: { fontSize: '1rem', color: COLORS.warmGray, margin: 0, lineHeight: 1.5 },
  legendWrap: { display: 'flex', justifyContent: 'center', marginBottom: '1rem' },
  mapWrap: { maxWidth: '1100px', margin: '0 auto' },
};
