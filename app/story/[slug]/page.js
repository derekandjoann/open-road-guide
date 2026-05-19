'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { parseInlineLinks } from '../../../lib/parseInlineLinks';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const toSlug = (s) =>
  s
    ?.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || '';

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

export default function StoryPage() {
  const params = useParams();
  const slug = params?.slug;

  const [story, setStory] = useState(null);
  const [relatedPois, setRelatedPois] = useState([]);
  const [relatedRoutes, setRelatedRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      setLoading(true);

      // Fetch the story
      const { data: storyData, error: storyErr } = await supabase
        .from('stories')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      if (storyErr || !storyData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setStory(storyData);

      // Fetch related POIs (many-to-many via story_pois join)
      const { data: poiData } = await supabase
        .from('story_pois')
        .select('poi:pois(id, name, slug, tagline, nearest_city, category, published)')
        .eq('story_id', storyData.id);

      const cleanedPois = (poiData || [])
        .map((row) => row.poi)
        .filter((p) => p && p.published !== false);

      setRelatedPois(cleanedPois);

      // Fetch related routes (many-to-many via story_routes join)
      const { data: routeData } = await supabase
        .from('story_routes')
        .select('route:routes(id, name, slug, short_description, state, published)')
        .eq('story_id', storyData.id);

      const cleanedRoutes = (routeData || [])
        .map((row) => row.route)
        .filter((r) => r && r.published !== false);

      setRelatedRoutes(cleanedRoutes);

      setLoading(false);
    }

    load();
  }, [slug]);

  // SEO meta tags
  useEffect(() => {
    if (!story) return;

    const title = story.seo_title || `${story.title} | Open Road Guide`;
    const desc =
      story.meta_description ||
      story.excerpt ||
      `Read ${story.title} on Open Road Guide.`;

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
    setMeta('meta[property="og:type"]', 'content', 'article');
    if (story.hero_image_url) {
      setMeta('meta[property="og:image"]', 'content', story.hero_image_url);
    }

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://openroadguide.com/story/${slug}`);
  }, [story, slug]);

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.loading}>Loading…</div>
      </main>
    );
  }

  if (notFound || !story) {
    return (
      <main style={styles.main}>
        <div style={styles.notFound}>
          <h1 style={styles.notFoundTitle}>Story not found</h1>
          <p>We couldn&apos;t find a story called &ldquo;{slug}&rdquo;.</p>
          <Link href="/stories" style={styles.link}>
            ← Back to all stories
          </Link>
        </div>
      </main>
    );
  }

  // Split body into blocks on blank lines. Each block becomes a heading or
  // a paragraph based on its leading characters.
  //   "## Foo"  -> section heading  (h2)
  //   "### Bar" -> sub-heading       (h3)
  //   anything else -> paragraph
  // Stories without any markdown headings (like the original Boulder story)
  // render exactly as before.
  const blocks = (story.body || '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  // Format published date if present
  const publishedDate = story.published_at
    ? new Date(story.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <main style={styles.main}>
      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>
          Home
        </Link>
        <span style={styles.crumbSep}>›</span>
        <Link href="/stories" style={styles.crumbLink}>
          Stories
        </Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{story.title}</span>
      </nav>

      {/* Hero image (if set) */}
      {story.hero_image_url && (
        <div style={styles.heroImageWrap}>
          <img
            src={story.hero_image_url}
            alt={story.hero_image_alt || story.title}
            style={styles.heroImage}
          />
        </div>
      )}

      {/* Title block */}
      <header style={styles.titleBlock}>
        {story.story_type && (
          <div style={styles.eyebrow}>{story.story_type}</div>
        )}
        <h1 style={styles.title}>{story.title}</h1>
        {story.subtitle && (
          <h2 style={styles.subtitle}>{story.subtitle}</h2>
        )}
        {story.excerpt && (
          <p style={styles.excerpt}>{story.excerpt}</p>
        )}

        {/* Byline row */}
        <div style={styles.byline}>
          {story.author_name && (
            <span style={styles.bylineAuthor}>By {story.author_name}</span>
          )}
          {story.author_name && (publishedDate || story.reading_time_minutes) && (
            <span style={styles.bylineSep}>·</span>
          )}
          {publishedDate && (
            <span>{publishedDate}</span>
          )}
          {publishedDate && story.reading_time_minutes && (
            <span style={styles.bylineSep}>·</span>
          )}
          {story.reading_time_minutes && (
            <span>{story.reading_time_minutes} min read</span>
          )}
        </div>
      </header>

      {/* Body */}
      {blocks.length > 0 && (
        <article style={styles.bodyWrap}>
          {blocks.map((block, i) => {
            // Order matters: check ### before ## (since ### also starts with ##)
            if (block.startsWith('### ')) {
              return (
                <h3 key={i} style={styles.bodyH3}>
                  {block.slice(4)}
                </h3>
              );
            }
            if (block.startsWith('## ')) {
              return (
                <h2 key={i} style={styles.bodyH2}>
                  {block.slice(3)}
                </h2>
              );
            }
            return (
              <p key={i} style={styles.bodyPara}>
                {parseInlineLinks(block)}
              </p>
            );
          })}
        </article>
      )}

      {/* Related POIs */}
      {relatedPois.length > 0 && (
        <section style={styles.relatedSection}>
          <h3 style={styles.relatedHeading}>Places in this story</h3>
          <div style={styles.relatedGrid}>
            {relatedPois.map((poi) => (
              <Link
                key={poi.id}
                href={`/poi/${poi.slug || toSlug(poi.name)}`}
                style={styles.relatedCard}
              >
                <div style={styles.relatedCardName}>{poi.name}</div>
                {poi.nearest_city && (
                  <div style={styles.relatedCardCity}>{poi.nearest_city}</div>
                )}
                {poi.tagline && (
                  <p style={styles.relatedCardTagline}>{poi.tagline}</p>
                )}
                <div style={styles.relatedCardCta}>View place →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Related Routes */}
      {relatedRoutes.length > 0 && (
        <section style={styles.relatedSection}>
          <h3 style={styles.relatedHeading}>Drives in this story</h3>
          <div style={styles.relatedGrid}>
            {relatedRoutes.map((route) => (
              <Link
                key={route.id}
                href={`/route/${route.slug}`}
                style={styles.relatedCard}
              >
                <div style={styles.relatedCardName}>{route.name}</div>
                {route.state && (
                  <div style={styles.relatedCardCity}>{route.state}</div>
                )}
                {route.short_description && (
                  <p style={styles.relatedCardTagline}>
                    {route.short_description}
                  </p>
                )}
                <div style={styles.relatedCardCta}>Plan this drive →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Closing */}
      <section style={styles.closing}>
        <Link href="/stories" style={styles.closingLink}>
          ← Read more stories
        </Link>
      </section>
    </main>
  );
}

const styles = {
  main: {
    maxWidth: '780px',
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
  notFound: { textAlign: 'center', padding: '4rem 1rem' },
  notFoundTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    marginBottom: '1rem',
  },
  link: { color: COLORS.coral, textDecoration: 'none', fontWeight: 500 },

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

  // Hero image
  heroImageWrap: {
    margin: '0 0 2.5rem 0',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#f4f4f4',
  },
  heroImage: {
    display: 'block',
    width: '100%',
    height: 'auto',
    maxHeight: '500px',
    objectFit: 'cover',
  },

  // Title block
  titleBlock: {
    marginBottom: '3rem',
    paddingBottom: '2rem',
    borderBottom: `3px solid ${COLORS.coral}`,
  },
  eyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: COLORS.coral,
    marginBottom: '1rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(2.25rem, 6vw, 3.5rem)',
    fontWeight: 600,
    margin: '0 0 1rem 0',
    lineHeight: 1.1,
    color: COLORS.ink,
    wordBreak: 'break-word',
  },
  subtitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.25rem, 3vw, 1.6rem)',
    fontWeight: 400,
    margin: '0 0 1.25rem 0',
    lineHeight: 1.3,
    color: '#444',
    fontStyle: 'italic',
  },
  excerpt: {
    fontSize: 'clamp(1.1rem, 2.2vw, 1.3rem)',
    lineHeight: 1.55,
    color: '#3a3a4e',
    margin: '0 0 1.5rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
    maxWidth: '36rem',
  },
  byline: {
    fontSize: '0.9rem',
    color: COLORS.warmGray,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
  },
  bylineAuthor: { fontWeight: 600, color: COLORS.ink },
  bylineSep: { color: '#bbb' },

  // Body
  bodyWrap: {
    marginBottom: '4rem',
  },
  bodyPara: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
    lineHeight: 1.8,
    color: '#222',
    margin: '0 0 1.5rem 0',
  },
  // Section heading inside body (## ...)
  bodyH2: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)',
    fontWeight: 600,
    color: COLORS.ink,
    margin: '2.5rem 0 1rem 0',
    lineHeight: 1.25,
  },
  // Sub-heading inside body (### ...)
  bodyH3: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)',
    fontWeight: 500,
    fontStyle: 'italic',
    color: '#3a3a4e',
    margin: '2rem 0 0.75rem 0',
    lineHeight: 1.3,
  },

  // Related sections
  relatedSection: {
    marginBottom: '3.5rem',
  },
  relatedHeading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(1.35rem, 3.5vw, 1.75rem)',
    fontWeight: 600,
    margin: '0 0 1.25rem 0',
    color: COLORS.ink,
  },
  relatedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
    gap: '1rem',
  },
  relatedCard: {
    display: 'block',
    padding: '1rem 1.15rem',
    background: '#fff',
    border: '1px solid #ececec',
    borderRadius: '12px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    borderLeft: `3px solid ${COLORS.teal}`,
  },
  relatedCardName: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.1rem',
    fontWeight: 600,
    color: COLORS.ink,
    marginBottom: '0.25rem',
  },
  relatedCardCity: {
    fontSize: '0.75rem',
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
    marginBottom: '0.5rem',
  },
  relatedCardTagline: {
    fontSize: '0.9rem',
    lineHeight: 1.5,
    color: '#555',
    margin: '0 0 0.75rem 0',
    fontStyle: 'italic',
  },
  relatedCardCta: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: COLORS.coral,
    letterSpacing: '0.02em',
  },

  // Closing
  closing: {
    textAlign: 'center',
    padding: '2rem 0 1rem 0',
    marginTop: '2rem',
    borderTop: '1px solid #eee',
  },
  closingLink: {
    color: COLORS.coral,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
};