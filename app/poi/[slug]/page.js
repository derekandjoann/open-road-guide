'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getCategoryColor, getCategoryEmoji } from '../../../lib/categoryColors';
import { toSlug } from '../../../lib/slug';
import MapView from '../../../components/MapView';

export default function PoiDetailPage() {
  const params = useParams();
  const slug = params.slug;

  const [poi, setPoi] = useState(null);
  const [relatedPois, setRelatedPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchPoi() {
      setLoading(true);
      setNotFound(false);

      let { data, error } = await supabase
        .from('pois')
        .select('*');

      if (error) {
        console.error('Error fetching POIs:', error);
        setLoading(false);
        setNotFound(true);
        return;
      }

      let match = null;
      if (data) {
        match = data.find(p => {
          if (p.slug && p.slug === slug) return true;
          return toSlug(p.name) === slug;
        });
      }

      if (!match) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPoi(match);

      const related = data
        .filter(p => p.category === match.category && p.id !== match.id)
        .slice(0, 4);
      setRelatedPois(related);

      setLoading(false);
    }

    if (slug) fetchPoi();
  }, [slug]);

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
      }}>
        Loading...
      </div>
    );
  }

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
        padding: '40px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏜️</div>
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '28px',
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

      <nav style={{
        background: '#1a1a2e',
        padding: '16px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{
          textDecoration: 'none',
          fontFamily: "'Fraunces', serif",
          fontSize: '20px',
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

      <div style={{
        padding: '14px 28px',
        background: '#fff',
        borderBottom: '1px solid #e8e6e1',
        fontSize: '13px',
        color: '#999',
      }}>
        <a href="/" style={{ color: '#999', textDecoration: 'none' }}>Home</a>
        {' / '}
        <a href="/explore" style={{ color: '#999', textDecoration: 'none' }}>Explore</a>
        {' / '}
        <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{poi.name}</span>
      </div>

      <section style={{
        background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        padding: '60px 28px 70px',
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
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.1,
            marginBottom: '16px',
          }}>{poi.name}</h1>

          {poi.tagline && (
            <p style={{
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.5,
              maxWidth: '600px',
            }}>{poi.tagline}</p>
          )}

          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '28px',
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

      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0 28px',
      }}>

        {poi.fun_fact && (
          <div style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '24px 28px',
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
              fontSize: '24px',
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
            fontSize: '24px',
            fontWeight: 800,
            color: '#1a1a2e',
            marginBottom: '16px',
          }}>Visitor Info</h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '14px',
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
            fontSize: '24px',
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
              fontSize: '24px',
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: '16px',
            }}>More {categoryLabel} Stops</h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
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
                      padding: '20px',
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
        padding: '40px 28px',
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
      padding: '18px',
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
      <div>
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
        }}>{value}</div>
      </div>
    </div>
  );
}

