'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import CategoryMap from '../../components/CategoryMap';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

export default function StoriesIndexPage() {
  const [stories, setStories] = useState([]);
  // States that actually have published stories, in states-table sort order:
  // [{ slug, name }]. Drives the filter chips; self-maintaining as states grow.
  const [stateOptions, setStateOptions] = useState([]);
  // null = "All". Otherwise the canonical state name (e.g. "Nevada").
  const [activeState, setActiveState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Newest first by published_at, falling back to created_at.
      // Linked POI coordinates ride along so the map can place a pin.
      // States roster fetched in parallel so the chips speak the same
      // slug/order language as the hub, nav, and sitemap.
      const [{ data: storyData }, { data: stateData }] = await Promise.all([
        supabase
          .from('stories')
          .select('*, story_pois(pois(longitude, latitude))')
          .eq('published', true)
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('states')
          .select('slug, name')
          .eq('published', true)
          .order('sort_order', { ascending: true }),
      ]);

      const rows = storyData || [];

      // Only offer a chip for a state that has at least one published story.
      const present = new Set(rows.map((s) => s.state).filter(Boolean));
      const options = (stateData || []).filter((s) => present.has(s.name));

      setStories(rows);
      setStateOptions(options);

      // Honour an incoming ?state=<slug> deep-link from a hub's "read more"
      // path. Read straight from the URL — the page is fully client-rendered,
      // so this sidesteps the useSearchParams Suspense requirement.
      const params = new URLSearchParams(window.location.search);
      const wanted = (params.get('state') || '').toLowerCase();
      const match = options.find((s) => s.slug === wanted);
      setActiveState(match ? match.name : null);

      setLoading(false);
    }
    load();
  }, []);

  // SEO meta tags. Canonical stays on bare /stories — ?state= is a filter,
  // not a distinct indexable page.
  useEffect(() => {
    const title = 'Stories | Open Road Guide';
    const desc =
      'Long-reads about the places, people, and history that make the American West worth driving across.';

    document.title = title;

    const setMeta = (selector, attr, value) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const m = selector.match(/\[(\w+)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:type"]', 'content', 'website');

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://openroadguide.com/stories');
  }, []);

  // Apply a state lens. Writes the choice to the URL (shallow, no reload) so the
  // filtered view is shareable and hub deep-links round-trip cleanly.
  function applyState(option) {
    const name = option ? option.name : null;
    setActiveState(name);

    const url = new URL(window.location.href);
    if (option) url.searchParams.set('state', option.slug);
    else url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
  }

  // The visible set after the lens, then the featured/regular split rides on it.
  const visibleStories = activeState
    ? stories.filter((s) => s.state === activeState)
    : stories;

  const featured = visibleStories.filter((s) => s.featured);
  const regular = visibleStories.filter((s) => !s.featured);

  // Map data: pin each story at the average position of its linked POIs.
  const storyMapData = visibleStories
    .map((s) => {
      const pts = (s.story_pois || [])
        .map((sp) => sp.pois)
        .filter(
          (p) =>
            p &&
            typeof p.longitude === 'number' &&
            typeof p.latitude === 'number'
        )
        .map((p) => [p.longitude, p.latitude]);
      if (pts.length === 0) return null;
      const lng = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      return {
        slug: s.slug,
        title: s.title,
        type: s.story_type,
        hero: s.hero_image_url,
        lng,
        lat,
      };
    })
    .filter(Boolean);

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>Stories</span>
      </nav>

      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>Open Road Guide</div>
        <h1 style={styles.title}>Stories</h1>
        <p style={styles.tagline}>
          Long-reads about the places, people, and history that make the
          American West worth driving across.
        </p>
      </header>

      {/* State lens — only shown once more than one state has stories */}
      {!loading && stateOptions.length > 1 && (
        <div style={styles.filterRow} role="group" aria-label="Filter stories by state">
          <FilterChip
            label="All"
            active={activeState === null}
            onClick={() => applyState(null)}
          />
          {stateOptions.map((s) => (
            <FilterChip
              key={s.slug}
              label={s.name}
              active={activeState === s.name}
              onClick={() => applyState(s)}
            />
          ))}
        </div>
      )}

      {/* Explorable map of where each story takes place (in the current lens) */}
      {!loading && storyMapData.length > 0 && (
        <section style={styles.mapSection}>
          <CategoryMap mode="stories" stories={storyMapData} />
          <p style={styles.mapCaption}>
            Each pin marks where a story takes place — tap one to read it.
          </p>
        </section>
      )}

      {/* Content */}
      {loading ? (
        <div style={styles.loading}>Loading stories…</div>
      ) : stories.length === 0 ? (
        <EmptyState />
      ) : visibleStories.length === 0 ? (
        <div style={styles.loading}>No published stories in {activeState} yet.</div>
      ) : (
        <>
          {featured.length > 0 && (
            <section style={styles.featuredSection}>
              <h2 style={styles.sectionHeading}>Featured</h2>
              <div style={styles.featuredGrid}>
                {featured.map((story) => (
                  <StoryCard key={story.id} story={story} variant="featured" />
                ))}
              </div>
            </section>
          )}

          {regular.length > 0 && (
            <section style={styles.regularSection}>
              {featured.length > 0 && (
                <h2 style={styles.sectionHeading}>More Stories</h2>
              )}
              <div style={styles.regularGrid}>
                {regular.map((story) => (
                  <StoryCard key={story.id} story={story} variant="regular" />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

// ---- Empty state ----

function EmptyState() {
  return (
    <section style={styles.empty}>
      <div style={styles.emptyEyebrow}>In the works</div>
      <h2 style={styles.emptyTitle}>Stories coming soon</h2>
      <p style={styles.emptyText}>
        We are crafting long-reads about the places, ranches, history, and people
        that make these drives worth taking. Pioneer cattle outfits in Boulder.
        The geology of the Hogback. Why Hells Backbone Grill changed how Utah
        eats. The works.
      </p>
      <p style={styles.emptyText}>
        In the meantime, the road itself is the story. Start with the drive.
      </p>
      <div style={styles.emptyCta}>
        <Link href="/routes" style={styles.emptyCtaLink}>
          Explore the routes →
        </Link>
      </div>
    </section>
  );
}

// ---- Filter chip ----

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...styles.chip,
        ...(active ? styles.chipActive : styles.chipIdle),
      }}
    >
      {label}
    </button>
  );
}

// ---- Story card ----

function StoryCard({ story, variant }) {
  const isFeatured = variant === 'featured';

  const date = story.published_at
    ? new Date(story.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <Link
      href={`/story/${story.slug}`}
      style={isFeatured ? styles.cardFeatured : styles.card}
    >
      {story.hero_image_url && (
        <div
          style={isFeatured ? styles.cardImageFeatured : styles.cardImage}
        >
          <img
            src={story.hero_image_url}
            alt={story.hero_image_alt || story.title}
            style={styles.cardImageImg}
          />
        </div>
      )}
      <div style={styles.cardBody}>
        {story.story_type && (
          <div style={styles.cardEyebrow}>{story.story_type}</div>
        )}
        <h3
          style={isFeatured ? styles.cardTitleFeatured : styles.cardTitle}
        >
          {story.title}
        </h3>
        {story.subtitle && (
          <p style={styles.cardSubtitle}>{story.subtitle}</p>
        )}
        {story.excerpt && (
          <p style={styles.cardExcerpt}>{story.excerpt}</p>
        )}
        <div style={styles.cardMeta}>
          {story.author_name && (
            <span style={styles.cardMetaAuthor}>{story.author_name}</span>
          )}
          {story.author_name && (date || story.reading_time_minutes) && (
            <span style={styles.cardMetaSep}>·</span>
          )}
          {date && <span>{date}</span>}
          {date && story.reading_time_minutes && (
            <span style={styles.cardMetaSep}>·</span>
          )}
          {story.reading_time_minutes && (
            <span>{story.reading_time_minutes} min read</span>
          )}
        </div>
        <div style={styles.cardCta}>Read the story →</div>
      </div>
    </Link>
  );
}

// ---- Styles ----

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

  // Breadcrumb
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

  // Hero
  hero: {
    marginBottom: '3rem',
    paddingBottom: '2rem',
    borderBottom: `3px solid ${COLORS.coral}`,
    maxWidth: '46rem',
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
    fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    lineHeight: 1.05,
    color: COLORS.ink,
  },
  tagline: {
    fontSize: 'clamp(1.05rem, 2.2vw, 1.3rem)',
    lineHeight: 1.55,
    color: '#3a3a4e',
    margin: 0,
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
  },

  // State lens filter
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
    marginBottom: '2rem',
    alignItems: 'center',
  },
  chip: {
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '0.9rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '0.5rem 1.1rem',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    lineHeight: 1.2,
  },
  chipIdle: {
    background: '#fff',
    color: COLORS.warmGray,
    border: '1.5px solid #e2e2e2',
  },
  chipActive: {
    background: COLORS.ink,
    color: '#fff',
    border: `1.5px solid ${COLORS.ink}`,
  },

  // Map
  mapSection: {
    marginBottom: '3rem',
  },
  mapCaption: {
    fontSize: '0.85rem',
    color: COLORS.warmGray,
    margin: '0.75rem 0 0 0',
    fontStyle: 'italic',
    fontFamily: "'Fraunces', Georgia, serif",
  },

  // Empty state
  empty: {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: '3rem 1rem',
    textAlign: 'left',
  },
  emptyEyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.teal,
    marginBottom: '1rem',
  },
  emptyTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    fontWeight: 600,
    margin: '0 0 1.5rem 0',
    lineHeight: 1.15,
    color: COLORS.ink,
  },
  emptyText: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.05rem, 2vw, 1.15rem)',
    lineHeight: 1.7,
    color: '#3a3a4e',
    margin: '0 0 1.25rem 0',
    fontStyle: 'italic',
  },
  emptyCta: {
    marginTop: '2rem',
  },
  emptyCtaLink: {
    display: 'inline-block',
    padding: '0.75rem 1.5rem',
    background: COLORS.coral,
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.95rem',
    borderRadius: '8px',
    letterSpacing: '0.02em',
  },

  // Section headings
  sectionHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.5rem, 4vw, 2rem)',
    fontWeight: 600,
    margin: '0 0 1.5rem 0',
    color: COLORS.ink,
  },

  // Featured section
  featuredSection: {
    marginBottom: '3.5rem',
  },
  featuredGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
    gap: '2rem',
  },
  cardFeatured: {
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    textDecoration: 'none',
    color: 'inherit',
    overflow: 'hidden',
    borderTop: `4px solid ${COLORS.coral}`,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardImageFeatured: {
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#f4f4f4',
    overflow: 'hidden',
  },
  cardTitleFeatured: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.65rem, 4vw, 2rem)',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    lineHeight: 1.15,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },

  // Regular section
  regularSection: {
    marginBottom: '3rem',
  },
  regularGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '1.5rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '14px',
    textDecoration: 'none',
    color: 'inherit',
    overflow: 'hidden',
    borderTop: `4px solid ${COLORS.teal}`,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardImage: {
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#f4f4f4',
    overflow: 'hidden',
  },
  cardImageImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },

  // Shared card body
  cardBody: {
    padding: 'clamp(1.25rem, 3vw, 1.75rem)',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  cardEyebrow: {
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.coral,
    marginBottom: '0.6rem',
  },
  cardTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.3rem, 3vw, 1.55rem)',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    lineHeight: 1.2,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  cardSubtitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1rem',
    fontWeight: 400,
    fontStyle: 'italic',
    margin: '0 0 0.85rem 0',
    color: '#555',
    lineHeight: 1.4,
  },
  cardExcerpt: {
    fontSize: '0.95rem',
    lineHeight: 1.55,
    color: '#444',
    margin: '0 0 1rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
    flexGrow: 1,
  },
  cardMeta: {
    fontSize: '0.8rem',
    color: COLORS.warmGray,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
    marginBottom: '0.85rem',
  },
  cardMetaAuthor: { fontWeight: 600, color: COLORS.ink },
  cardMetaSep: { color: '#bbb' },
  cardCta: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: COLORS.coral,
    letterSpacing: '0.02em',
    marginTop: 'auto',
  },
};
