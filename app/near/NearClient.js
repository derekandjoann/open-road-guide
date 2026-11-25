'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MapView from '../../components/MapView';
import { thumbImage } from '../../lib/images';

const COLORS = { coral: '#FF6B6B', violet: '#9D4EDD', ink: '#1a1a2e', warmGray: '#666' };
const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const SERIF = "'Fraunces', Georgia, serif";

function fmtMiles(mi) {
  if (mi == null) return '';
  if (mi < 0.2) return 'steps away';
  if (mi < 10) return `${Number(mi).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export default function NearClient() {
  const [origin, setOrigin] = useState(null); // { lat, lng, label }
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | locating | loading | done | error | denied

  // A town from search arrives as ?lat=&lng=&label=; otherwise wait for a tap,
  // because phones ask permission for location and that should be the
  // visitor's choice.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get('lat'));
    const lng = Number(p.get('lng'));
    if (p.get('lat') && Number.isFinite(lat) && Number.isFinite(lng)) {
      setOrigin({ lat, lng, label: p.get('label') || null });
    }
  }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(`/api/data?kind=near&lat=${origin.lat}&lng=${origin.lng}`);
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        if (!cancelled) {
          setData(d);
          setStatus('done');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origin]);

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('denied');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setOrigin({ lat, lng, label: null });
        const url = new URL(window.location.href);
        url.search = '';
        window.history.replaceState({}, '', url);
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  const places = (data?.places || []).filter((p) => p.latitude != null);
  const markers = (data?.markers || []).filter((m) => m.latitude != null);

  const mapPois = places.map((p) => ({
    id: p.slug,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    category: p.category,
    tagline: p.tagline,
    href: `/poi/${p.slug}`,
  }));
  const mapMarkers = markers.map((m) => ({
    name: m.name,
    latitude: m.latitude,
    longitude: m.longitude,
    href: `/marker/${m.slug}`,
  }));

  return (
    <main style={styles.main}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={styles.title}>{origin?.label ? `Near ${origin.label}` : 'What’s near me'}</h1>
        <p style={styles.tagline}>The closest places and historical markers, nearest first.</p>
      </header>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button type="button" onClick={locate} style={styles.btn}>
          📍 {origin && !origin.label ? 'Update my location' : 'Use my location'}
        </button>
        <Link href="/search" prefetch={false} style={styles.btnGhost}>Search instead</Link>
      </div>

      {status === 'locating' && <div style={styles.meta}>Finding you…</div>}
      {status === 'loading' && <div style={styles.meta}>Loading what&rsquo;s nearby…</div>}
      {status === 'denied' && (
        <div style={styles.note}>
          Location isn&rsquo;t available. On an iPhone or iPad, allow it in Settings → Privacy &amp; Security →
          Location Services for your browser, or search for a town instead.
        </div>
      )}
      {status === 'error' && <div style={styles.note}>Nearby stops couldn&rsquo;t be loaded. Please try again.</div>}

      {status === 'done' && (
        <>
          {(mapPois.length > 0 || mapMarkers.length > 0) && (
            <div style={{ marginBottom: '2rem' }}>
              <MapView pois={mapPois} historicalMarkers={mapMarkers} height="420px" />
            </div>
          )}

          {places.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={styles.h2}>Places</h2>
              <div style={styles.list}>
                {places.map((p) => (
                  <Link key={p.slug} href={`/poi/${p.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.coral}` }}>
                    {(p.thumbnail_public_id || p.thumbnail_url) && (
                      <img src={thumbImage(p, 160)} alt="" loading="lazy" style={styles.thumb} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.cardTitle}>{p.name}</div>
                      {p.tagline && <div style={styles.cardSub}>{p.tagline}</div>}
                    </div>
                    <div style={styles.dist}>{fmtMiles(p.distance_miles)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {markers.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={styles.h2}>Historical markers</h2>
              <div style={styles.list}>
                {markers.map((m) => (
                  <Link key={m.slug} href={`/marker/${m.slug}`} prefetch={false} style={{ ...styles.card, borderLeft: `4px solid ${COLORS.violet}` }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.cardTitle}>{m.name}</div>
                      {(m.city || m.state) && <div style={styles.cardSub}>{[m.city, m.state].filter(Boolean).join(', ')}</div>}
                    </div>
                    <div style={styles.dist}>{fmtMiles(m.distance_miles)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {places.length === 0 && markers.length === 0 && (
            <div style={styles.note}>Nothing in the guide close to here yet.</div>
          )}
        </>
      )}
    </main>
  );
}

const styles = {
  main: { maxWidth: '820px', margin: '0 auto', padding: 'clamp(1rem, 4vw, 2.5rem)', fontFamily: FONT, color: COLORS.ink },
  title: { fontFamily: SERIF, fontSize: 'clamp(2rem, 7vw, 3.2rem)', fontWeight: 600, margin: '0 0 0.4rem', lineHeight: 1.05 },
  tagline: { fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.1rem', color: '#3a3a4e', margin: 0 },
  btn: {
    background: COLORS.ink, color: '#fff', border: 'none', borderRadius: '999px', padding: '0.7rem 1.3rem',
    fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', fontFamily: FONT,
  },
  btnGhost: {
    background: '#fff', color: COLORS.ink, border: '1.5px solid #e2e2e2', borderRadius: '999px',
    padding: '0.6rem 1.2rem', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
  },
  meta: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.warmGray, marginBottom: '1rem' },
  note: { padding: '1rem 0', color: '#444', lineHeight: 1.5 },
  h2: { fontFamily: SERIF, fontSize: '1.4rem', fontWeight: 600, margin: '0 0 0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: {
    display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.8rem 1rem', background: '#fff',
    border: '1px solid #ececec', borderRadius: '12px', textDecoration: 'none', color: COLORS.ink,
  },
  thumb: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flex: '0 0 auto' },
  cardTitle: { fontFamily: SERIF, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.2 },
  cardSub: { fontSize: '0.88rem', color: '#555', lineHeight: 1.4, marginTop: '0.2rem' },
  dist: { fontSize: '0.85rem', fontWeight: 600, color: COLORS.warmGray, whiteSpace: 'nowrap' },
};
