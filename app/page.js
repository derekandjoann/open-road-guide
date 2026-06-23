'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import MapView from '../components/MapView';
import MapLegend from '../components/MapLegend';
import { getCategoryColor, getCategoryEmoji } from '../lib/categoryColors';
import { toSlug } from '../lib/slug';


export default function HomePage() {
  const [pois, setPois] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPois() {
      const { data, error } = await supabase
        .from('pois')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching POIs:', error);
      } else {
        setPois(data);
        const cats = [...new Set(data.map(p => p.category).filter(Boolean))].sort();
        setCategories(cats);
      }
      setLoading(false);
    }
    fetchPois();
  }, []);

  // Pick featured POIs — spread across categories
  const featured = [];
  const usedCats = new Set();
  for (const poi of pois) {
    if (featured.length >= 6) break;
    if (poi.tagline && !usedCats.has(poi.category)) {
      featured.push(poi);
      usedCats.add(poi.category);
    }
  }
  if (featured.length < 6) {
    for (const poi of pois) {
      if (featured.length >= 6) break;
      if (poi.tagline && !featured.includes(poi)) {
        featured.push(poi);
      }
    }
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#1a1a2e' }}>

      {/* ===== HERO ===== */}
      <section style={{
        position: 'relative',
        background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        padding: '0',
        minHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Decorative road lines */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          opacity: 0.06,
          background: `repeating-linear-gradient(90deg, transparent, transparent 48%, #ffb627 48%, #ffb627 52%, transparent 52%)`,
          pointerEvents: 'none',
        }} />
        {/* Gradient orbs */}
        <div style={{
          position: 'absolute',
          width: '400px', height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,91,0.15) 0%, transparent 70%)',
          top: '-100px', right: '-50px',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          width: '300px', height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,92,252,0.12) 0%, transparent 70%)',
          bottom: '-50px', left: '10%',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: '900px',
          margin: '0 auto',
          padding: '60px 28px 80px',
          textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,182,39,0.15)',
            border: '1px solid rgba(255,182,39,0.3)',
            borderRadius: '20px',
            padding: '6px 16px',
            marginBottom: '28px',
          }}>
            <span style={{ fontSize: '14px' }}>🛣️</span>
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffb627',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>Now Exploring: Utah</span>
          </div>

          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.1,
            marginBottom: '20px',
          }}>
            Your road trip starts{' '}
            <span style={{
              background: 'linear-gradient(135deg, #ff6b5b, #ffb627)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>here</span>.
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2.5vw, 20px)',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto 36px',
          }}>
            Discover {pois.length} incredible stops across Utah — from red rock
            canyons to alpine lakes, roadside wonders to hidden gems. We mapped
            the stories behind the places.
          </p>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}>
            <a href="/explore" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #ff6b5b, #ff8a7d)',
              color: '#fff',
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 700,
              fontSize: '16px',
              borderRadius: '12px',
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(255,107,91,0.4)',
            }}>
              🗺️ Explore the Map
            </a>
            <a href="#map-preview" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 32px',
              background: 'rgba(255,255,255,0.08)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              color: '#fff',
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 600,
              fontSize: '16px',
              borderRadius: '12px',
              textDecoration: 'none',
            }}>
              ↓ See a Preview
            </a>
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '40px',
            marginTop: '52px',
            flexWrap: 'wrap',
          }}>
            {[
              { num: pois.length, label: 'Places' },
              { num: categories.length, label: 'Categories' },
              { num: '8+', label: 'Highway Corridors' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: '32px',
                  fontWeight: 800,
                  color: '#12b5a0',
                }}>{stat.num}</div>
                <div style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: 500,
                }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MAP PREVIEW ===== */}
      <section id="map-preview" style={{ padding: '64px 28px', background: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '8px',
            }}>All of Utah, One Map</h2>
            <p style={{ fontSize: '16px', color: '#888', maxWidth: '500px', margin: '0 auto' }}>
              Click any dot to discover what makes each place special.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <MapLegend categories={categories} />
          </div>

          {loading ? (
            <div style={{
              height: '500px', background: '#f0eeea', borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#aaa', fontFamily: "'Fraunces', serif", fontSize: '18px',
            }}>Loading map...</div>
          ) : (
            <MapView pois={pois} interactive={true} height="500px" compact={false} />
          )}

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <a href="/map" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 28px', background: '#1a1a2e', color: '#fff',
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '15px',
              borderRadius: '10px', textDecoration: 'none',
            }}>Open Full-Screen Map →</a>
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#999', fontFamily: "'Outfit', sans-serif" }}>
              The full map layers in scenic routes, regions, and the stories that tie places together — and can now find places near you.
            </div>
          </div>
        </div>
      </section>

      {/* ===== CATEGORY TILES ===== */}
      <section style={{ padding: '64px 28px', background: '#f8f7f4' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 800,
            color: '#1a1a2e',
            textAlign: 'center',
            marginBottom: '36px',
          }}>Explore by Category</h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {categories.map((cat) => {
              const count = pois.filter(p => p.category === cat).length;
              const color = getCategoryColor(cat);
              const emoji = getCategoryEmoji(cat);
              const label = cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <a
                  key={cat}
                  href={`/explore`}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    padding: '24px 20px', background: '#fff', borderRadius: '14px',
                    textDecoration: 'none', border: '1.5px solid #e8e6e1',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: `${color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px',
                  }}>{emoji}</div>
                  <div style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: '16px', fontWeight: 700, color: '#1a1a2e',
                  }}>{label}</div>
                  <div style={{ fontSize: '13px', color: '#999', fontWeight: 500 }}>
                    {count} {count === 1 ? 'place' : 'places'}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FEATURED POIS ===== */}
      {featured.length > 0 && (
        <section style={{ padding: '64px 28px', background: '#fff' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(24px, 4vw, 32px)',
              fontWeight: 800, color: '#1a1a2e',
              textAlign: 'center', marginBottom: '12px',
            }}>Don't-Miss Stops</h2>
            <p style={{
              fontSize: '15px', color: '#888', textAlign: 'center', marginBottom: '36px',
            }}>Handpicked highlights from across Utah.</p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px',
            }}>
              {featured.map((poi) => {
                const color = getCategoryColor(poi.category);
                const label = poi.category
                  ? poi.category.charAt(0).toUpperCase() + poi.category.slice(1)
                  : 'Place';
                
                 const poiSlug = poi.slug || toSlug(poi.name);
                  return(
                    <a key={poi.id} href={`/poi/${poiSlug}`} style={{
                      background: '#faf9f7', borderRadius: '14px', padding: '24px',
                      border: '1.5px solid #e8e6e1',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    textDecoration: 'none', color: 'inherit',
                    }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        width: '10px', height: '10px', borderRadius: '50%', background: color,
                      }} />
                      <span style={{
                        fontSize: '11px', fontWeight: 600, color: color,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{label}</span>
                    </div>
                    <div style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: '18px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3,
                    }}>{poi.name}</div>
                    <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
                      {poi.tagline}
                    </div>
                    {poi.fun_fact && (
                      <div style={{
                        fontSize: '13px', color: '#888', fontStyle: 'italic',
                        marginTop: '4px', lineHeight: 1.4,
                      }}>💡 {poi.fun_fact}</div>
                    )}
                    <div style={{
                      display: 'flex', gap: '12px', marginTop: '8px',
                      fontSize: '12px', color: '#aaa',
                    }}>
                      {poi.visit_duration && <span>⏱ {poi.visit_duration}</span>}
                      {poi.admission && <span>🎟 {poi.admission}</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ===== FOOTER ===== */}
      <footer style={{
        background: '#1a1a2e', padding: '40px 28px', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: '20px',
          fontWeight: 800, color: '#ff6b5b', marginBottom: '8px',
        }}>Open Road Guide</div>
        <p style={{
          fontSize: '13px', color: 'rgba(255,255,255,0.35)',
          maxWidth: '400px', margin: '0 auto',
        }}>Built with love for the open road. More states coming soon.</p>
      </footer>
    </div>
  );
}
