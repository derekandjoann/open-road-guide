'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getCategoryColor, getCategoryEmoji } from '../../../lib/categoryColors';
import { toSlug } from '../../../lib/slug';
import { parseInlineLinks } from '../../../lib/parseInlineLinks';
import MapView from '../../../components/MapView';

// Colors for tag pills, keyed by tag_category slug.
// These match the Open Road Guide palette (coral, teal, yellow, violet) with a few extras.
const CATEGORY_COLORS = {
  theme:     { bg: '#fef0ed', border: '#ff6b5b', text: '#c43d2d' }, // coral
  geology:   { bg: '#fdf4e3', border: '#d4a017', text: '#8a6508' }, // sandstone gold
  activity:  { bg: '#e6f4f4', border: '#2ba6a4', text: '#0f5957' }, // teal
  season:    { bg: '#fef7e0', border: '#ffb627', text: '#946600' }, // sunny yellow
  vibe:      { bg: '#f0ebf7', border: '#7b5fb8', text: '#4a3680' }, // violet
  practical: { bg: '#eef0f3', border: '#5a6577', text: '#2e3744' }, // slate
};

function getTagColors(categorySlug) {
  return CATEGORY_COLORS[categorySlug] || CATEGORY_COLORS.practical;
}

// Format a distance in miles for the Nearby cards: one decimal under 10 mi,
// whole numbers above. e.g. 0.3 -> "0.3 mi away", 28.1 -> "28 mi away".
function formatDistance(miles) {
  if (miles == null) return null;
  const n = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${n} mi away`;
}

export default function PoiDetailPage() {
  const params = useParams();
  const slug = params.slug;

  const [poi, setPoi] = useState(null);
  const [tags, setTags] = useState([]);
  const [relatedPois, setRelatedPois] = useState([]);
  const [nearbyIsGeo, setNearbyIsGeo] = useState(false);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ---------- Update browser tab title + meta description for SEO ----------
  useEffect(() => {
    if (!poi) return;
    const title = `${poi.name} | Open Road Guide`;
    document.title = title;

    const desc =
      poi.meta_description ||
      poi.tagline ||
      (poi.description ? poi.description.slice(0, 155) : `Visit ${poi.name} on your Utah road trip.`);

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', desc);

    // Open Graph for nicer link previews when shared
    const setOg = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setOg('og:title', title);
    setOg('og:description', desc);
    setOg('og:type', 'article');
  }, [poi]);

  // ---------- Fetch POI, its tags, related POIs, and related stories ----------
  useEffect(() => {
    async function fetchEverything() {
      setLoading(true);
      setNotFound(false);

      // 1. Try to fetch the POI directly by its database slug first (fast path).
      //    Only consider published POIs — unpublished ones (tombstones) should 404.
      let { data: matchByDbSlug, error: dbSlugErr } = await supabase
        .from('pois')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      let match = matchByDbSlug;

      // 2. Fallback: if not found, scan all POIs and match by generated slug from name.
      //    This keeps old links working in case any POI doesn't have a slug column value yet.
      //    Same as the fast path — only consider published POIs.
      if (!match) {
        const { data: allPois, error: allErr } = await supabase
          .from('pois')
          .select('*')
          .eq('published', true);

        if (allErr) {
          console.error('Error fetching POIs:', allErr);
          setNotFound(true);
          setLoading(false);
          return;
        }

        match = allPois?.find(p => toSlug(p.name) === slug);
      }

      if (!match) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPoi(match);

      // 3. Fetch tags for this POI, joined with tag_categories so we can color them.
      const { data: poiTagRows, error: tagsErr } = await supabase
        .from('poi_tags')
        .select(`
          tag:tags (
            id,
            slug,
            name,
            description,
            category:tag_categories ( slug, name )
          )
        `)
        .eq('poi_id', match.id);

      if (tagsErr) {
        console.warn('Could not load tags:', tagsErr);
      }

      const myTags = (poiTagRows || [])
        .map(row => row.tag)
        .filter(Boolean);
      setTags(myTags);

      // 4. Fetch stories that feature this POI via the story_pois join table.
      //    Only show published stories. Sorted by published_at desc (newest first),
      //    falling back to created_at for stories without a published_at value.
      const { data: storyRows, error: storiesErr } = await supabase
        .from('story_pois')
        .select(`
          story:stories (
            id,
            slug,
            title,
            subtitle,
            excerpt,
            story_type,
            hero_image_url,
            hero_image_alt,
            reading_time_minutes,
            author_name,
            published,
            published_at,
            created_at
          )
        `)
        .eq('poi_id', match.id);

      if (storiesErr) {
        console.warn('Could not load stories:', storiesErr);
      }

      const myStories = (storyRows || [])
        .map(row => row.story)
        .filter(s => s && s.published) // only published stories
        .sort((a, b) => {
          const aDate = a.published_at || a.created_at;
          const bDate = b.published_at || b.created_at;
          return new Date(bDate) - new Date(aDate);
        });
      setStories(myStories);

      // 5. Find NEARBY POIs by geographic distance (primary path).
      //    Calls the nearby_pois() Postgres function, which ranks all other
      //    published POIs by great-circle distance from this one. Falls back to
      //    the original theme-based logic (shared tags, then same category) only
      //    when this POI has no coordinates or the lookup comes back empty.
      let usedGeo = false;

      if (match.slug && match.latitude != null && match.longitude != null) {
        const { data: nearbyData, error: nearbyErr } = await supabase
          .rpc('nearby_pois', { target_slug: match.slug, max_results: 6 });

        if (nearbyErr) {
          console.warn('Could not load nearby POIs:', nearbyErr);
        } else if (nearbyData && nearbyData.length > 0) {
          const withDistance = nearbyData.filter(p => p.distance_miles != null);
          if (withDistance.length > 0) {
            setRelatedPois(withDistance);
            usedGeo = true;
          }
        }
      }

      setNearbyIsGeo(usedGeo);

      if (!usedGeo) {
        // ---- Fallback: original theme-based related stops ----
        // Shared tags first (most-overlap wins), then same-category.
        const myTagIds = myTags.map(t => t.id);

        if (myTagIds.length > 0) {
          // Get every poi_tag row for any of my tags, excluding this POI itself.
          const { data: sharedRows } = await supabase
            .from('poi_tags')
            .select('poi_id, tag_id')
            .in('tag_id', myTagIds)
            .neq('poi_id', match.id);

          // Tally overlap counts per POI
          const overlap = {};
          (sharedRows || []).forEach(r => {
            overlap[r.poi_id] = (overlap[r.poi_id] || 0) + 1;
          });

          // Sort POIs by shared-tag count, take the top 4
          const topPoiIds = Object.entries(overlap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => id);

          if (topPoiIds.length > 0) {
            const { data: relatedData } = await supabase
              .from('pois')
              .select('id, name, slug, category, tagline')
              .eq('published', true)
              .in('id', topPoiIds);

            // Preserve the sort order from overlap counts
            const ordered = topPoiIds
              .map(id => relatedData?.find(p => p.id === id))
              .filter(Boolean);
            setRelatedPois(ordered);
          } else {
            setRelatedPois([]);
          }
        } else {
          // No tags assigned yet → fall back to same-category POIs so the section isn't empty.
          const { data: sameCategory } = await supabase
            .from('pois')
            .select('id, name, slug, category, tagline')
            .eq('published', true)
            .eq('category', match.category)
            .neq('id', match.id)
            .limit(4);
          setRelatedPois(sameCategory || []);
        }
      }

      setLoading(false);
    }

    if (slug) fetchEverything();
  }, [slug]);

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Fraunces', serif",
        fontSize: '20px',
        color: '#888',
        background: '#f8f7f4',
        padding: '20px',
      }}>
        Loading...
      </div>
    );
  }

  // ---------- Not found state ----------
  if (notFound) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit', sans-serif",
        background: '#f8f7f4',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏜️</div>
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 'clamp(24px, 5vw, 28px)',
          fontWeight: 800,
          color: '#1a1a2e',
          marginBottom: '8px',
        }}>Place Not Found</h1>
        <p style={{ color: '#888', fontSize: '16px', marginBottom: '24px' }}>
          We couldn&apos;t find this stop on the map.
        </p>
        <a href="/explore" style={{
          padding: '12px 28px',
          background: '#ff6b5b',
          color: '#fff',
          borderRadius: '10px',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '15px',
        }}>
          Explore All Places →
        </a>
      </div>
    );
  }

  // ---------- Main render ----------
  const color = getCategoryColor(poi.category);
  const emoji = getCategoryEmoji(poi.category);
  const categoryLabel = poi.category
    ? poi.category.charAt(0).toUpperCase() + poi.category.slice(1)
    : 'Place';

  // Split description into blocks for paragraph + heading rendering.
  // Mirrors the story renderer's behavior:
  //   "## Foo"  -> section heading (h2)
  //   "### Bar" -> sub-heading (h3)
  //   anything else -> paragraph with inline link parsing
  const descriptionBlocks = (poi.description || '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif",
      color: '#1a1a2e',
      background: '#f8f7f4',
      minHeight: '100vh',
    }}>

      {/* Top nav */}
      <nav style={{
        background: '#1a1a2e',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <a href="/" style={{
          textDecoration: 'none',
          fontFamily: "'Fraunces', serif",
          fontSize: 'clamp(17px, 4vw, 20px)',
          fontWeight: 800,
          color: '#ff6b5b',
        }}>Open Road Guide</a>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a href="/explore" style={{
            color: 'rgba(255,255,255,0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}>Explore Map</a>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div style={{
        padding: '12px 20px',
        background: '#fff',
        borderBottom: '1px solid #e8e6e1',
        fontSize: '13px',
        color: '#999',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        <a href="/" style={{ color: '#999', textDecoration: 'none' }}>Home</a>
        {' / '}
        <a href="/explore" style={{ color: '#999', textDecoration: 'none' }}>Explore</a>
        {' / '}
        <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{poi.name}</span>
      </div>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        padding: 'clamp(40px, 8vw, 60px) 20px clamp(50px, 9vw, 70px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}25 0%, transparent 70%)`,
          top: '-80px',
          right: '-40px',
          pointerEvents: 'none',
        }} />

        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: `${color}20`,
            border: `1px solid ${color}40`,
            borderRadius: '20px',
            padding: '6px 16px',
            marginBottom: '20px',
          }}>
            <span style={{ fontSize: '16px' }}>{emoji}</span>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: color,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>{categoryLabel}</span>
          </div>

          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(28px, 6vw, 52px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.1,
            marginBottom: '16px',
          }}>{poi.name}</h1>

          {poi.tagline && (
            <p style={{
              fontSize: 'clamp(15px, 2.5vw, 20px)',
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.5,
              maxWidth: '600px',
              marginBottom: tags.length > 0 ? '24px' : '0',
            }}>{poi.tagline}</p>
          )}

          {/* Tag pills */}
          {tags.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: poi.tagline ? '0' : '20px',
            }}>
              {tags.map(tag => {
                const tagCategorySlug = tag.category?.slug || 'practical';
                const colors = getTagColors(tagCategorySlug);
                return (
                  <a
                    key={tag.id}
                    href={`/tag/${tag.slug}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 14px',
                      background: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}60`,
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag.name}
                  </a>
                );
              })}
            </div>
          )}

          {/* Info chips */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginTop: '24px',
            flexWrap: 'wrap',
          }}>
            {poi.visit_duration && (
              <InfoChip icon="⏱" label="Duration" value={poi.visit_duration} />
            )}
            {poi.admission && (
              <InfoChip icon="🎟" label="Admission" value={poi.admission} />
            )}
            {poi.best_season && (
              <InfoChip icon="📅" label="Best Season" value={poi.best_season} />
            )}
          </div>
        </div>
      </section>

      {/* Body content */}
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0 20px',
      }}>

        {poi.fun_fact && (
          <div style={{
            background: '#fff',
            borderRadius: '14px',
            padding: 'clamp(18px, 4vw, 24px) clamp(20px, 4vw, 28px)',
            marginTop: '-30px',
            position: 'relative',
            zIndex: 3,
            border: '1.5px solid #e8e6e1',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}>
              <span style={{
                fontSize: '24px',
                flexShrink: 0,
                marginTop: '2px',
              }}>💡</span>
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffb627',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: '6px',
                }}>Fun Fact</div>
                <div style={{
                  fontSize: '16px',
                  color: '#444',
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>{parseInlineLinks(poi.fun_fact)}</div>
              </div>
            </div>
          </div>
        )}

        {poi.description && descriptionBlocks.length > 0 && (
          <section style={{ marginTop: '40px' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(22px, 4.5vw, 24px)',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '16px',
            }}>The Story</h2>
            <div style={{
              fontSize: '16px',
              color: '#444',
              lineHeight: 1.8,
            }}>
              {descriptionBlocks.map((block, i) => {
                // Order matters: check ### before ## (since ### also starts with ##)
                if (block.startsWith('### ')) {
                  return (
                    <h3
                      key={i}
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: 'clamp(17px, 3vw, 19px)',
                        fontWeight: 500,
                        fontStyle: 'italic',
                        color: '#3a3a4e',
                        margin: '24px 0 8px 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {block.slice(4)}
                    </h3>
                  );
                }
                if (block.startsWith('## ')) {
                  return (
                    <h2
                      key={i}
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: 'clamp(19px, 3.5vw, 22px)',
                        fontWeight: 600,
                        color: '#1a1a2e',
                        margin: '32px 0 12px 0',
                        lineHeight: 1.25,
                      }}
                    >
                      {block.slice(3)}
                    </h2>
                  );
                }
                return (
                  <p key={i} style={{ margin: '0 0 1.2em 0' }}>
                    {parseInlineLinks(block)}
                  </p>
                );
              })}
            </div>
          </section>
        )}

        <section style={{ marginTop: '40px' }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(22px, 4.5vw, 24px)',
            fontWeight: 800,
            color: '#1a1a2e',
            marginBottom: '16px',
          }}>Visitor Info</h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
          }}>
            {poi.visit_duration && (
              <InfoCard icon="⏱" label="Time Needed" value={poi.visit_duration} />
            )}
            {poi.admission && (
              <InfoCard icon="🎟" label="Admission" value={poi.admission} />
            )}
            {poi.best_season && (
              <InfoCard icon="📅" label="Best Season" value={poi.best_season} />
            )}
            {poi.address && (
              <InfoCard icon="📍" label="Location" value={poi.address} />
            )}
            {poi.nearest_highway && (
              <InfoCard icon="🛣️" label="Highway" value={poi.nearest_highway} />
            )}
          </div>
        </section>

        <section style={{ marginTop: '40px' }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(22px, 4.5vw, 24px)',
            fontWeight: 800,
            color: '#1a1a2e',
            marginBottom: '16px',
          }}>On the Map</h2>
          <div style={{
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1.5px solid #e8e6e1',
          }}>
            <MapView
              pois={[poi]}
              interactive={true}
              height="350px"
              compact={true}
            />
          </div>
        </section>

        {/* ---------- Stories Featuring This Place ---------- */}
        {stories.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '6px',
            }}>
              <span style={{
                display: 'inline-block',
                width: '24px',
                height: '3px',
                background: '#ff6b5b',
                borderRadius: '2px',
              }} />
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#ff6b5b',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
              }}>Stories</span>
            </div>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(22px, 4.5vw, 24px)',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '6px',
            }}>
              {stories.length === 1 ? 'A story featuring this place' : 'Stories featuring this place'}
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#888',
              marginBottom: '18px',
            }}>
              Go deeper into the history and character of this stop
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '14px',
            }}>
              {stories.map((story) => (
                <a
                  key={story.id}
                  href={`/story/${story.slug}`}
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    textDecoration: 'none',
                    border: '1.5px solid #e8e6e1',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    minHeight: '110px',
                  }}
                >
                  {/* Image or coral fallback block */}
                  {story.hero_image_url ? (
                    <div style={{
                      width: '110px',
                      flexShrink: 0,
                      background: `#f0ebe4 url(${story.hero_image_url}) center/cover no-repeat`,
                    }}
                    role="img"
                    aria-label={story.hero_image_alt || story.title}
                    />
                  ) : (
                    <div style={{
                      width: '110px',
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8a7a 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px',
                    }}>
                      <span style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                        textAlign: 'center',
                        lineHeight: 1.3,
                      }}>
                        {story.story_type || 'Story'}
                      </span>
                    </div>
                  )}

                  {/* Card body */}
                  <div style={{
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '4px',
                    minWidth: 0,
                    flex: 1,
                  }}>
                    {story.story_type && story.hero_image_url && (
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#ff6b5b',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                      }}>
                        {story.story_type}
                      </div>
                    )}
                    <div style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#1a1a2e',
                      lineHeight: 1.25,
                    }}>
                      {story.title}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#888',
                      marginTop: '2px',
                    }}>
                      {story.author_name && <span>{story.author_name}</span>}
                      {story.author_name && story.reading_time_minutes ? ' · ' : ''}
                      {story.reading_time_minutes && (
                        <span>{story.reading_time_minutes} min read</span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {relatedPois.length > 0 && (
          <section style={{ marginTop: '48px', marginBottom: '60px' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(22px, 4.5vw, 24px)',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '6px',
            }}>{nearbyIsGeo ? 'Nearby' : (tags.length > 0 ? 'Related Stops' : `More ${categoryLabel} Stops`)}</h2>
            <p style={{
              fontSize: '14px',
              color: '#888',
              marginBottom: '18px',
            }}>
              {nearbyIsGeo
                ? 'The closest stops worth working into your route'
                : tags.length > 0
                  ? 'Places that share the most in common with this one'
                  : `Other ${categoryLabel.toLowerCase()} stops on the route`}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '14px',
            }}>
              {relatedPois.map((rp) => {
                const rpColor = getCategoryColor(rp.category);
                const rpSlug = rp.slug || toSlug(rp.name);
                const distanceLabel = formatDistance(rp.distance_miles);
                return (
                  <a
                    key={rp.slug || rp.id}
                    href={`/poi/${rpSlug}`}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      padding: '18px',
                      textDecoration: 'none',
                      border: '1.5px solid #e8e6e1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      justifyContent: 'space-between',
                    }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        minWidth: 0,
                      }}>
                        <span style={{
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: rpColor,
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: rpColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>{rp.category}</span>
                      </span>
                      {distanceLabel && (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#aaa',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}>{distanceLabel}</span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#1a1a2e',
                      lineHeight: 1.3,
                    }}>{rp.name}</div>
                    {rp.tagline && (
                      <div style={{
                        fontSize: '13px',
                        color: '#888',
                        lineHeight: 1.4,
                      }}>{rp.tagline}</div>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <footer style={{
        background: '#1a1a2e',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '20px',
          fontWeight: 800,
          color: '#ff6b5b',
          marginBottom: '8px',
        }}>Open Road Guide</div>
        <p style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.35)',
          maxWidth: '400px',
          margin: '0 auto',
        }}>Built with love for the open road. More states coming soon.</p>
      </footer>
    </div>
  );
}

function InfoChip({ icon, label, value }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '10px',
      padding: '8px 14px',
    }}>
      <span style={{ fontSize: '14px' }}>{icon}</span>
      <div>
        <div style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 600,
        }}>{label}</div>
        <div style={{
          fontSize: '13px',
          color: '#fff',
          fontWeight: 600,
        }}>{value}</div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '16px',
      border: '1.5px solid #e8e6e1',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      <span style={{
        fontSize: '20px',
        flexShrink: 0,
        marginTop: '2px',
      }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#aaa',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '4px',
        }}>{label}</div>
        <div style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#1a1a2e',
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}>{value}</div>
      </div>
    </div>
  );
}