'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { thumbImage } from '../../lib/images';
import { toPlainText } from '../../lib/plainText';

const COLORS = {
  coral: '#FF6B6B',
  teal: '#4ECDC4',
  yellow: '#FFD93D',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  warmGray: '#666',
};

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const SERIF = "'Fraunces', Georgia, serif";

// One box, every kind of content. Typing waits a quarter-second, then asks
// the database once (site_search) for each kind at the same time.
export default function SearchClient() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // ?q= deep links (and the browser's back button) restore the search.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q') || '';
    if (initial) setQ(initial);
    else inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    const url = new URL(window.location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url);

    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      let data = {};
      try {
        const res = await fetch(`/api/data?kind=site-search&q=${encodeURIComponent(term)}`);
        if (res.ok) data = await res.json();
      } catch {
        data = {};
      }
      if (cancelled) return;
      setResults(data || {});
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const r = results || {};
  const total = ['states', 'towns', 'places', 'markers', 'routes', 'stories', 'regions']
    .reduce((n, k) => n + (Array.isArray(r[k]) ? r[k].length : 0), 0);

  return (
    <main style={styles.main}>
      <header style={styles.hero}>
        <h1 style={styles.title}>Search</h1>
        <p style={styles.tagline}>Places, historical markers, drives, stories and towns.</p>
      </header>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
        style={styles.searchRow}
      >
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Search Open Road Guide"
          placeholder="Try Moab, Route 66, ghost town, the Alamo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={styles.input}
        />
      </form>

      <div style={styles.nearRow}>
        <Link href="/near" prefetch={false} style={styles.nearBtn}>
          📍 What&rsquo;s near me
        </Link>
      </div>

      {loading && <div style={styles.meta}>Searching…</div>}

      {!loading && results && total === 0 && (
        <div style={styles.empty}>Nothing matches &ldquo;{q.trim()}&rdquo; yet. Try a town, a highway number or a single word.</div>
      )}

      {!loading && results && total > 0 && (
        <div>
          <Section title="States" items={r.states} render={(s) => (
            <ResultLink key={s.slug} href={`/${s.slug}`} eyebrow="State guide" title={s.name} />
          )} />

          <Section title="Towns" items={r.towns} render={(t) => (
            <ResultLink
              key={`${t.town}|${t.state}`}
              href={`/near?lat=${t.lat.toFixed(4)}&lng=${t.lng.toFixed(4)}&label=${encodeURIComponent(`${t.town}, ${t.state}`)}`}
              eyebrow={`Town · ${t.state}`}
              title={t.town}
              sub={`${t.n} ${t.n === 1 ? 'stop' : 'stops'} in and around town`}
            />
          )} />

          <Section title="Places" items={r.places} render={(p) => (
            <ResultLink
              key={p.slug}
              href={`/poi/${p.slug}`}
              eyebrow={[p.category, p.nearest_city, p.state].filter(Boolean).join(' · ')}
              title={p.name}
              sub={p.tagline}
              thumb={p.thumbnail_public_id || p.thumbnail_url ? thumbImage(p, 160) : null}
            />
          )} />

          <Section title="Historical markers" items={r.markers} render={(m) => (
            <ResultLink
              key={m.slug}
              href={`/marker/${m.slug}`}
              eyebrow={['Marker', m.city, m.state].filter(Boolean).join(' · ')}
              title={m.name}
              accent={COLORS.violet}
            />
          )} />

          <Section title="Drives" items={r.routes} render={(rt) => (
            <ResultLink
              key={rt.slug}
              href={`/route/${rt.slug}`}
              eyebrow={['Drive', rt.state, rt.total_miles ? `${Math.round(rt.total_miles)} mi` : null].filter(Boolean).join(' · ')}
              title={rt.name}
              sub={rt.short_description}
              accent={COLORS.teal}
            />
          )} />

          <Section title="Stories" items={r.stories} render={(st) => (
            <ResultLink
              key={st.slug}
              href={`/story/${st.slug}`}
              eyebrow={['Story', st.state].filter(Boolean).join(' · ')}
              title={st.title}
              sub={st.excerpt}
              accent={COLORS.yellow}
            />
          )} />

          <Section title="Regions" items={r.regions} render={(rg) => (
            <ResultLink key={rg.slug} href={`/region/${rg.slug}`} eyebrow={['Region', rg.state].filter(Boolean).join(' · ')} title={rg.name} />
          )} />
        </div>
      )}
    </main>
  );
}

function Section({ title, items, render }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={styles.sectionHeading}>{title}</h2>
      <div style={styles.list}>{items.map(render)}</div>
    </section>
  );
}

function ResultLink({ href, eyebrow, title, sub, thumb, accent = COLORS.coral }) {
  return (
    <Link href={href} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${accent}` }}>
      {thumb && <img src={thumb} alt="" loading="lazy" style={styles.thumb} />}
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div style={{ ...styles.eyebrow, color: accent }}>{eyebrow}</div>}
        <div style={styles.cardTitle}>{title}</div>
        {sub && <div style={styles.cardSub}>{toPlainText(sub)}</div>}
      </div>
    </Link>
  );
}

const styles = {
  main: { maxWidth: '820px', margin: '0 auto', padding: 'clamp(1rem, 4vw, 2.5rem)', fontFamily: FONT, color: COLORS.ink },
  hero: { marginBottom: '1.25rem' },
  title: { fontFamily: SERIF, fontSize: 'clamp(2.2rem, 7vw, 3.5rem)', fontWeight: 600, margin: '0 0 0.4rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.1rem', color: '#3a3a4e', margin: 0 },
  searchRow: { marginBottom: '0.9rem' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '0.95rem 1.1rem', borderRadius: '12px',
    border: '1.5px solid #e2e2e2', background: '#fff', color: COLORS.ink, fontSize: '1.05rem',
    fontFamily: FONT, outline: 'none',
  },
  nearRow: { marginBottom: '1.75rem' },
  nearBtn: {
    display: 'inline-block', background: COLORS.ink, color: '#fff', borderRadius: '999px',
    padding: '0.6rem 1.2rem', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
  },
  meta: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.warmGray },
  empty: { padding: '2rem 0', color: COLORS.warmGray, fontSize: '1.05rem' },
  sectionHeading: { fontFamily: SERIF, fontSize: '1.4rem', fontWeight: 600, margin: '0 0 0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: {
    display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.8rem 1rem', background: '#fff',
    border: '1px solid #ececec', borderRadius: '12px', textDecoration: 'none', color: COLORS.ink,
  },
  thumb: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  eyebrow: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: {
    fontSize: '0.88rem', color: '#555', lineHeight: 1.4, marginTop: '0.2rem',
    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
};
