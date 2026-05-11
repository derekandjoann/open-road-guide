'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getCategoryColor, getCategoryEmoji } from '../../../lib/categoryColors';
import { toSlug } from '../../../lib/slug';
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

export default function PoiDetailPage() {
  const params = useParams();
  const slug = params.slug;

  const [poi, setPoi] = useState(null);
  const [tags, setTags] = useState([]);
  const [relatedPois, setRelatedPois] = useState([]);
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

  // ---------- Fetch POI, its tags, and related POIs ----------
  useEffect(() => {
    async function fetchEverything() {
      setLoading(true);
      setNotFound(false);

      // 1. Try to fetch the POI directly by its database slug first (fast path).
      let { data: matchByDbSlug, error: dbSlugErr } = await supabase
        .from('pois')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      let match = matchByDbSlug;

      // 2. Fallback: if not found, scan all POIs and match by generated slug from name.
      //    This keeps old links working in case any POI doesn't have a slug column value yet.
      if (!match) {
        const { data: allPois, error: allErr } = await supabase
          .from('pois')
          .select('*');

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

      // 4. Find related POIs by shared tags. Most-overlap wins.
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
          .eq('category', match.category)
          .neq('id', match.id)
          .limit(4);
        setRelatedPois(sameCategory || []);
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
                }}>{poi.fun_fact}</div>
              </div>
            </div>
          </div>
        )}

        {poi.description && (
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
              whiteSpace: 'pre-line',
            }}>{poi.description}</div>
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
            {poi.highway && (
              <InfoCard icon="🛣️" label="Highway" value={poi.highway} />
            )}
            {poi.elevation && (
              <InfoCard icon="⛰️" label="Elevation" value={poi.elevation} />
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

        {relatedPois.length > 0 && (
          <section style={{ marginTop: '48px', marginBottom: '60px' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(22px, 4.5vw, 24px)',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '6px',
            }}>{tags.length > 0 ? 'Related Stops' : `More ${categoryLabel} Stops`}</h2>
            <p style={{
              fontSize: '14px',
              color: '#888',
              marginBottom: '18px',
            }}>
              {tags.length > 0
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
                return (
                  <a
                    key={rp.id}
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
                    }}>
                      <span style={{
                        width: '8px', height: '8px',
                        borderRadius: '50%',
                        background: rpColor,
                      }} />
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: rpColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>{rp.category}</span>
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