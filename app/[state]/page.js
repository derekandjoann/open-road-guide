import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import MapView from '../../components/MapView';
import MapLegend from '../../components/MapLegend';
import { notFound } from 'next/navigation';

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

// Serve a right-sized hero from Supabase's render endpoint instead of the
// multi-megabyte original. Falls back untouched for non-Supabase URLs.
function heroSrc(url, width = 1600) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

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

// Per-region accent hues, assigned by name-sorted order so a region's color is
// stable across the site (mirrors the regions index).
const REGION_COLORS = [
  '#C1432E', '#D9772B', '#C99A2E', '#7E8A2E', '#4F8F4A', '#2E9E83', '#3E9CC0',
  '#3E6FB0', '#6A5BAE', '#8E4FA0', '#B5468A', '#C24E6A', '#7C6A55', '#5B8C7B',
];

// Pre-build a static hub for every published state at deploy time. Unknown
// slugs render on-demand (and 404 via the guard below); a deploy refreshes this.
export async function generateStaticParams() {
  const { data } = await supabase
    .from('states')
    .select('slug')
    .eq('published', true);

  return (data || [])
    .filter((s) => s.slug)
    .map((s) => ({ state: s.slug }));
}

export async function generateMetadata({ params }) {
  const { state: stateSlug } = await params;

  const { data: state } = await supabase
    .from('states')
    .select('name, tagline, hero_image_url')
    .eq('slug', stateSlug)
    .eq('published', true)
    .maybeSingle();

  if (!state) {
    return { title: { absolute: 'State not found | Open Road Guide' } };
  }

  const title = `${state.name} Road Trip Guide | Open Road Guide`;
  const description =
    state.tagline ||
    `Explore ${state.name} — the regions, scenic drives, stories, and roadside stops worth pulling over for.`;
  const url = `https://openroadguide.com/${stateSlug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      ...(state.hero_image_url ? { images: [heroSrc(state.hero_image_url, 1200)] } : {}),
    },
  };
}

export default async function StateHubPage({ params }) {
  const { state: stateSlug } = await params;

  // Resolve the state. Unknown / unpublished slug → friendly not-found.
  const { data: state } = await supabase
    .from('states')
    .select('*')
    .eq('slug', stateSlug)
    .eq('published', true)
    .maybeSingle();

  // Unknown or unpublished slug -> a real 404 via the site-wide app/not-found.js,
  // not a soft 200. This route's [state] segment catches every bad top-level
  // path, so without this guard they'd all resolve 200.
  if (!state) {
    notFound();
  }

  const name = state.name;

  // Everything is scoped to this state's canonical name. Routes also include
  // any drive that crosses into this state (state = name OR name in crossings).
  const [poiRes, regionRes, storyRes, routeRes, markerRes, itinRes, trailRes] = await Promise.all([
    supabase
      .from('pois')
      .select('id, name, slug, tagline, category, longitude, latitude')
      .eq('published', true)
      .eq('state', name),
    supabase
      .from('regions')
      .select('*, region_pois(pois(id))')
      .eq('published', true)
      .eq('state', name)
      .order('name', { ascending: true }),
    supabase
      .from('stories')
      .select('*')
      .eq('published', true)
      .eq('state', name)
      .order('published_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('routes')
      .select('*')
      .eq('published', true)
      .or(`state.eq.${name},crossing_states.cs.{"${name}"}`)
      .order('name', { ascending: true }),
    supabase
      .from('markers')
      .select('id', { count: 'exact', head: true })
      .eq('state', name),
    supabase
      .from('itineraries')
      .select('id, slug, title, subtitle, days_count, total_miles, best_seasons, start_location, end_location')
      .eq('published', true)
      .eq('state', name)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: true }),
    // Cross-state trails have no single state — they surface on every state
    // they cross, matched via crossing_states (same idea as multi-state routes).
    supabase
      .from('trails')
      .select('id, slug, title, subtitle, best_seasons, crossing_states')
      .eq('published', true)
      .contains('crossing_states', [name])
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true }),
  ]);

  const pois = (poiRes.data || []).filter(
    (p) => typeof p.longitude === 'number' && typeof p.latitude === 'number'
  );
  const regions = (regionRes.data || []).map((r, i) => ({
    ...r,
    _color: REGION_COLORS[i % REGION_COLORS.length],
  }));
  const stories = storyRes.data || [];
  const routes = routeRes.data || [];
  const markerCount = markerRes?.count || 0;
  const itineraries = itinRes.data || [];
  const trails = trailRes.data || [];

  // The hub shows at most six stories; the rest live on the filtered index.
  const storiesToShow = stories.slice(0, 6);

  const categories = [...new Set(pois.map((p) => p.category).filter(Boolean))].sort();

  const stat = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const statBits = [
    pois.length > 0 && stat(pois.length, 'place', 'places'),
    regions.length > 0 && stat(regions.length, 'region', 'regions'),
    stories.length > 0 && stat(stories.length, 'story', 'stories'),
    routes.length > 0 && stat(routes.length, 'drive', 'drives'),
    itineraries.length > 0 && stat(itineraries.length, 'itinerary', 'itineraries'),
    trails.length > 0 && stat(trails.length, 'trail', 'trails'),
    markerCount > 0 && stat(markerCount, 'marker', 'markers'),
  ].filter(Boolean);

  // ---------- Structured data (JSON-LD) ----------
  // Ships in the server-rendered HTML. A TouristDestination describes the
  // state hub itself; a BreadcrumbList mirrors the on-page Home › State
  // trail so Google can show a breadcrumb in results. Only fields we
  // actually have are emitted — no empty or guessed values.
  const hubUrl = `https://openroadguide.com/${stateSlug}`;
  const destinationLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name,
    description:
      state.tagline ||
      `Explore ${name} — the regions, scenic drives, stories, and roadside stops worth pulling over for.`,
    url: hubUrl,
    containedInPlace: { '@type': 'Country', name: 'United States' },
  };
  if (state.hero_image_url) {
    destinationLd.image = state.hero_image_url;
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://openroadguide.com/' },
      { '@type': 'ListItem', position: 2, name, item: hubUrl },
    ],
  };

  // Escape "<" so prose containing "</script>" can't break out of the tag.
  const jsonLdHtml = JSON.stringify([destinationLd, breadcrumbLd]).replace(/</g, '\\u003c');

  return (
    <main style={styles.main}>
      {/* Structured data for search engines (read from the server-rendered HTML) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />

      {/* Breadcrumb */}
      <nav style={styles.breadcrumb}>
        <Link href="/" style={styles.crumbLink}>Home</Link>
        <span style={styles.crumbSep}>›</span>
        <span style={styles.crumbCurrent}>{name}</span>
      </nav>

      {/* Hero image */}
      {state.hero_image_url && (
        <figure style={styles.heroFigure}>
          <img
            src={heroSrc(state.hero_image_url)}
            alt={name}
            style={styles.heroImage}
            loading="eager"
          />
          {state.hero_image_credit && (
            <figcaption style={styles.heroCredit}>{state.hero_image_credit}</figcaption>
          )}
        </figure>
      )}

      {/* Title block */}
      <header style={styles.hero}>
        <div style={styles.eyebrow}>A Road Trip Guide</div>
        <h1 style={styles.title}>{name}</h1>
        {state.tagline && <p style={styles.tagline}>{state.tagline}</p>}
        {statBits.length > 0 && (
          <div style={styles.statLine}>{statBits.join(' · ')}</div>
        )}
      </header>

      {/* The whole state, one map */}
      {pois.length > 0 && (
        <section style={styles.mapSection}>
          <h2 style={styles.sectionHeading}>All of {name}, One Map</h2>
          <p style={styles.sectionSub}>Tap any dot to discover what makes a place worth the stop.</p>
          {categories.length > 0 && (
            <div style={styles.legendWrap}>
              <MapLegend categories={categories} />
            </div>
          )}
          <MapView pois={pois} height="520px" />
        </section>
      )}

      {/* Plan a trip — day-by-day itineraries. Intent-first: this and the
          drives sit above the browse-by-geography sections on purpose. */}
      {itineraries.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Plan a Trip</h2>
          <p style={styles.sectionSub}>
            Day-by-day plans — real drive times, honest overnights, and the permit fine print sorted before you leave.
          </p>
          <div style={styles.cardsGrid}>
            {itineraries.map((it) => (
              <ItineraryCard key={it.id} itinerary={it} />
            ))}
          </div>
        </section>
      )}

      {/* Scenic drives */}
      {routes.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Scenic Drives</h2>
          <p style={styles.sectionSub}>
            The roads themselves — traced end to end, with the stops worth making along the way.
          </p>
          <div style={styles.cardsGrid}>
            {routes.map((rt) => (
              <RouteCard key={rt.id} route={rt} />
            ))}
          </div>
        </section>
      )}

      {/* Cross-state trails — themed journeys that thread this state into the
          wider West. Surfaced via crossing_states, same as multi-state drives. */}
      {trails.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Trails Across the West</h2>
          <p style={styles.sectionSub}>
            Themed journeys that thread {name} into the wider West — one story, told state to state.
          </p>
          <div style={styles.cardsGrid}>
            {trails.map((tr) => (
              <TrailCard key={tr.id} trail={tr} />
            ))}
          </div>
        </section>
      )}

      {/* Regions */}
      {regions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Regions of {name}</h2>
          <p style={styles.sectionSub}>
            Each region gathers the parks, towns, drives, and roadside stops that define one corner of the state.
          </p>
          <div style={styles.cardsGrid}>
            {regions.map((r) => (
              <RegionCard key={r.id} region={r} color={r._color} />
            ))}
          </div>
        </section>
      )}

      {/* Stories — the six newest; the rest live on the filtered stories index */}
      {storiesToShow.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Stories from {name}</h2>
          <p style={styles.sectionSub}>
            The histories behind the places — the people, the disasters, the inventions, and the long memory of the land.
          </p>
          <div style={styles.cardsGrid}>
            {storiesToShow.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
          {stories.length > storiesToShow.length && (
            <div style={styles.sectionMoreWrap}>
              <Link href={`/stories?state=${stateSlug}`} style={styles.sectionMoreLink}>
                All {stories.length} stories from {name} →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Historical markers */}
      {markerCount > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>Historical Markers</h2>
          <p style={styles.sectionSub}>
            Roadside history, plaque by plaque — every marker in {name}, grouped by county and searchable.
          </p>
          <Link href={`/markers?state=${stateSlug}`} style={styles.markerCard}>
            <div style={styles.markerCardMain}>
              <div style={{ ...styles.cardEyebrow, color: COLORS.violet }}>Roadside History</div>
              <h3 style={styles.cardTitle}>Markers of {name}</h3>
              <p style={styles.markerCardText}>
                Browse every historical marker across {name} — organized by county, each with its full plaque text.
              </p>
            </div>
            <div style={styles.markerCardSide}>
              <div style={styles.markerCount}>{markerCount}</div>
              <div style={styles.markerCountLabel}>markers</div>
              <div style={{ ...styles.cardCta, color: COLORS.violet }}>Browse by county →</div>
            </div>
          </Link>
        </section>
      )}

      {/* Back to chooser */}
      <div style={styles.backWrap}>
        <Link href="/" style={styles.backLink}>← Explore another state</Link>
      </div>
    </main>
  );
}

// ---- Cards ----

function RegionCard({ region, color }) {
  const c = color || COLORS.violet;
  const placeCount = Array.isArray(region.region_pois) ? region.region_pois.length : 0;
  return (
    <Link href={`/region/${region.slug}`} style={{ ...styles.card, borderTop: `4px solid ${c}` }}>
      <div style={{ ...styles.cardEyebrow, color: c }}>Region</div>
      <h3 style={styles.cardTitle}>{region.name}</h3>
      {region.short_description && <p style={styles.cardTagline}>{region.short_description}</p>}
      {placeCount > 0 && (
        <div style={{ ...styles.cardPill, background: c }}>
          {placeCount} {placeCount === 1 ? 'place' : 'places'} to explore
        </div>
      )}
      <div style={{ ...styles.cardCta, color: c }}>Explore region →</div>
    </Link>
  );
}

function StoryCard({ story }) {
  const date = story.published_at
    ? new Date(story.published_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null;
  return (
    <Link href={`/story/${story.slug}`} style={{ ...styles.card, borderTop: `4px solid ${COLORS.coral}`, padding: 0, overflow: 'hidden' }}>
      {story.hero_image_url && (
        <div style={styles.storyImageWrap}>
          <img src={heroSrc(story.hero_image_url, 600)} alt={story.hero_image_alt || story.title} loading="lazy" style={styles.storyImage} />
        </div>
      )}
      <div style={styles.storyBody}>
        {story.story_type && <div style={{ ...styles.cardEyebrow, color: COLORS.coral }}>{story.story_type}</div>}
        <h3 style={styles.cardTitle}>{story.title}</h3>
        {story.subtitle && <p style={styles.cardTagline}>{story.subtitle}</p>}
        {(story.author_name || date || story.reading_time_minutes) && (
          <div style={styles.storyMeta}>
            {[story.author_name, date, story.reading_time_minutes && `${story.reading_time_minutes} min read`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>
    </Link>
  );
}

function RouteCard({ route }) {
  const c = COLORS.teal;
  const seasons = Array.isArray(route.best_seasons) ? route.best_seasons.join(' · ') : route.best_seasons || '';
  return (
    <Link href={`/route/${route.slug}`} style={{ ...styles.card, borderTop: `4px solid ${c}` }}>
      <div style={{ ...styles.cardEyebrow, color: c }}>Scenic Byway</div>
      <h3 style={styles.cardTitle}>{route.name}</h3>
      {route.short_description && <p style={styles.cardTagline}>{route.short_description}</p>}
      <div style={styles.routeStats}>
        {route.total_miles && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.routeStatLabel}>Distance</div>
            <div style={styles.routeStatValue}>{route.total_miles} mi</div>
          </div>
        )}
        {route.estimated_drive_hours && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.routeStatLabel}>Drive</div>
            <div style={styles.routeStatValue}>{route.estimated_drive_hours} hrs</div>
          </div>
        )}
        {seasons && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.routeStatLabel}>Best</div>
            <div style={styles.routeStatValue}>{seasons}</div>
          </div>
        )}
      </div>
      <div style={{ ...styles.cardCta, color: c }}>Plan this drive →</div>
    </Link>
  );
}

function TrailCard({ trail }) {
  const c = COLORS.violet;
  const states = Array.isArray(trail.crossing_states) ? trail.crossing_states.length : 0;
  const seasons = Array.isArray(trail.best_seasons)
    ? trail.best_seasons.join(' · ')
    : trail.best_seasons || '';
  return (
    <Link href={`/trail/${trail.slug}`} style={{ ...styles.card, borderTop: `4px solid ${c}` }}>
      <div style={{ ...styles.cardEyebrow, color: c }}>Cross-State Trail</div>
      <h3 style={styles.cardTitle}>{trail.title}</h3>
      {trail.subtitle && <p style={styles.cardTagline}>{trail.subtitle}</p>}
      <div style={styles.routeStats}>
        {states > 0 && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.routeStatLabel}>Spans</div>
            <div style={styles.routeStatValue}>{states} states</div>
          </div>
        )}
        {seasons && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${c}` }}>
            <div style={styles.routeStatLabel}>Best</div>
            <div style={styles.routeStatValue}>{seasons}</div>
          </div>
        )}
      </div>
      <div style={{ ...styles.cardCta, color: c }}>Follow this trail →</div>
    </Link>
  );
}

function ItineraryCard({ itinerary }) {
  // Sunny-yellow top border; text accents use a darker amber for contrast.
  const border = COLORS.yellow;
  const accent = '#946600';
  const seasons = Array.isArray(itinerary.best_seasons)
    ? itinerary.best_seasons.join(' · ')
    : itinerary.best_seasons || '';
  return (
    <Link href={`/itinerary/${itinerary.slug}`} style={{ ...styles.card, borderTop: `4px solid ${border}` }}>
      <div style={{ ...styles.cardEyebrow, color: accent }}>
        {itinerary.days_count ? `${itinerary.days_count}-Day Itinerary` : 'Itinerary'}
      </div>
      <h3 style={styles.cardTitle}>{itinerary.title}</h3>
      {itinerary.subtitle && <p style={styles.cardTagline}>{itinerary.subtitle}</p>}
      <div style={styles.routeStats}>
        {itinerary.days_count && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${border}` }}>
            <div style={styles.routeStatLabel}>Days</div>
            <div style={styles.routeStatValue}>{itinerary.days_count}</div>
          </div>
        )}
        {itinerary.total_miles && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${border}` }}>
            <div style={styles.routeStatLabel}>Distance</div>
            <div style={styles.routeStatValue}>{itinerary.total_miles} mi</div>
          </div>
        )}
        {seasons && (
          <div style={{ ...styles.routeStat, borderLeft: `3px solid ${border}` }}>
            <div style={styles.routeStatLabel}>Best</div>
            <div style={styles.routeStatValue}>{seasons}</div>
          </div>
        )}
      </div>
      <div style={{ ...styles.cardCta, color: accent }}>See the day-by-day →</div>
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

  notFound: { textAlign: 'center', padding: '5rem 1rem' },
  notFoundTitle: { fontFamily: "'Fraunces', Georgia, serif", fontSize: '2rem', marginBottom: '1rem' },
  link: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600 },

  breadcrumb: {
    fontSize: '0.9rem', color: COLORS.warmGray, marginBottom: '1.5rem',
    display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
  },
  crumbLink: { color: COLORS.warmGray, textDecoration: 'none' },
  crumbSep: { color: '#bbb' },
  crumbCurrent: { color: COLORS.ink, fontWeight: 500 },

  heroFigure: { margin: '0 0 1.75rem 0', position: 'relative' },
  heroImage: {
    width: '100%', height: 'auto', display: 'block', borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(26,26,46,0.18)',
  },
  heroCredit: {
    fontSize: '0.72rem', color: COLORS.warmGray, marginTop: '0.5rem',
    fontStyle: 'italic', textAlign: 'right', fontFamily: "'Fraunces', Georgia, serif",
  },

  hero: { marginBottom: '3rem', paddingBottom: '2rem', borderBottom: `3px solid ${COLORS.coral}`, maxWidth: '52rem' },
  eyebrow: {
    fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: COLORS.coral, marginBottom: '0.75rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
    fontWeight: 600, margin: '0 0 1rem 0', lineHeight: 1.05, color: COLORS.ink,
  },
  tagline: {
    fontSize: 'clamp(1.05rem, 2.2vw, 1.3rem)', lineHeight: 1.55, color: '#3a3a4e',
    margin: '0 0 1.25rem 0', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif",
  },
  statLine: {
    fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: COLORS.warmGray,
  },

  section: { marginBottom: '3.5rem' },
  mapSection: { marginBottom: '3.5rem' },
  sectionHeading: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
    fontWeight: 600, margin: '0 0 0.4rem 0', color: COLORS.ink,
  },
  sectionSub: { fontSize: '1rem', color: COLORS.warmGray, margin: '0 0 1.5rem 0', maxWidth: '40rem', lineHeight: 1.5 },
  legendWrap: { display: 'flex', justifyContent: 'center', marginBottom: '1rem' },

  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '1.5rem',
  },

  card: {
    display: 'flex', flexDirection: 'column',
    padding: 'clamp(1.25rem, 3vw, 1.75rem)', background: '#fff',
    border: '1px solid #ececec', borderRadius: '14px', textDecoration: 'none',
    color: 'inherit', cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    borderTop: `4px solid ${COLORS.violet}`,
  },
  cardEyebrow: {
    fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '0.5rem',
  },
  cardTitle: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(1.4rem, 3.5vw, 1.7rem)',
    fontWeight: 600, margin: '0 0 0.6rem 0', lineHeight: 1.15, color: COLORS.ink, wordBreak: 'break-word',
  },
  cardTagline: {
    fontSize: '0.98rem', lineHeight: 1.55, color: '#444', margin: '0 0 1rem 0',
    fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif", flexGrow: 1,
  },
  cardPill: {
    display: 'inline-block', alignSelf: 'flex-start', fontSize: '0.72rem', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff',
    padding: '0.35rem 0.75rem', borderRadius: '999px', marginBottom: '1rem',
  },
  cardCta: { fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.02em', marginTop: 'auto' },

  markerCard: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    gap: '1.5rem', padding: 'clamp(1.5rem, 4vw, 2rem)', background: '#fff',
    border: '1px solid #ececec', borderRadius: '14px', borderTop: `4px solid ${COLORS.violet}`,
    textDecoration: 'none', color: 'inherit', cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  markerCardMain: { flex: '1 1 300px' },
  markerCardText: {
    fontSize: '0.98rem', lineHeight: 1.55, color: '#444', margin: 0,
    fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic',
  },
  markerCardSide: { flex: '0 0 auto', textAlign: 'center', minWidth: '120px' },
  markerCount: {
    fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(2.5rem, 7vw, 3.5rem)',
    fontWeight: 700, color: COLORS.violet, lineHeight: 1,
  },
  markerCountLabel: {
    fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: COLORS.warmGray, marginBottom: '0.75rem',
  },

  storyImageWrap: { width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: '#f0eeea' },
  storyImage: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  storyBody: { display: 'flex', flexDirection: 'column', padding: 'clamp(1.25rem, 3vw, 1.5rem)', flexGrow: 1 },
  storyMeta: { fontSize: '0.8rem', color: COLORS.warmGray, marginTop: 'auto' },

  routeStats: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', margin: '0 0 1rem 0' },
  routeStat: { paddingLeft: '0.6rem' },
  routeStatLabel: { fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.warmGray },
  routeStatValue: { fontSize: '0.95rem', fontWeight: 600, color: COLORS.ink },

  sectionMoreWrap: { textAlign: 'center', marginTop: '1.5rem' },
  sectionMoreLink: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem' },

  backWrap: { borderTop: '1px solid #ececec', paddingTop: '2rem', textAlign: 'center' },
  backLink: { color: COLORS.coral, textDecoration: 'none', fontWeight: 600, fontSize: '1rem' },
};
