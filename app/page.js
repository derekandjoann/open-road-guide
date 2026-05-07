'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [pois, setPois] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPois() {
      const { data, error } = await supabase
        .from('pois')
        .select('id, name, slug, tagline, category, county, nearest_highway, admission, visit_duration, fun_fact')
        .eq('published', true)
        .order('name')

      if (error) {
        console.error('Error fetching POIs:', error)
      } else {
        setPois(data)
      }
      setLoading(false)
    }
    fetchPois()
  }, [])

  const categoryCounts = {}
  pois.forEach(poi => {
    categoryCounts[poi.category] = (categoryCounts[poi.category] || 0) + 1
  })

  const categoryColors = {
    geological: '#3b9dff',
    historical: '#c4634a',
    natural: '#12b5a0',
    cultural: '#7c5cfc',
    culinary: '#f0487e',
    architectural: '#ffb627',
    industrial: '#8b8ba3',
    roadside: '#ff6b5b',
    attraction: '#e8944a',
    recreational: '#5ba0c8',
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', fontFamily: "'Outfit', sans-serif",
        fontSize: '1.2rem', color: '#8b8ba3',
      }}>
        Loading Utah POIs...
      </div>
    )
  }

  return (
    <main style={{ fontFamily: "'Outfit', sans-serif", background: '#fafbfc' }}>
      <section style={{
        background: 'linear-gradient(135deg, #1e1e2d 0%, #2a2a4a 100%)',
        color: 'white',
        padding: '4rem 2rem 3rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-100px', right: '-100px',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'rgba(255,107,91,0.15)', filter: 'blur(60px)',
        }} />
        <p style={{
          display: 'inline-block',
          background: 'rgba(255,107,91,0.15)',
          border: '1px solid rgba(255,107,91,0.3)',
          padding: '0.35rem 0.85rem', borderRadius: '50px',
          color: '#ff6b5b', fontSize: '0.72rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: '1.25rem', position: 'relative', zIndex: 1,
        }}>
          Every Mile Has a Story
        </p>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900,
          lineHeight: 1.15, marginBottom: '1rem',
          position: 'relative', zIndex: 1,
        }}>
          Explore <span style={{ color: '#ff6b5b' }}>Utah&apos;s</span> Open Roads
        </h1>
        <p style={{
          fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)',
          maxWidth: '550px', margin: '0 auto', lineHeight: 1.6,
          position: 'relative', zIndex: 1,
        }}>
          {pois.length} points of interest documented across every highway, canyon, and mesa.
        </p>
      </section>

      <section style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        justifyContent: 'center', padding: '1.5rem 2rem',
        maxWidth: '800px', margin: '0 auto',
      }}>
        {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
          <span key={cat} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.7rem', borderRadius: '50px',
            fontSize: '0.75rem', fontWeight: 700,
            background: `${categoryColors[cat]}15`,
            color: categoryColors[cat],
            border: `1px solid ${categoryColors[cat]}30`,
          }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: categoryColors[cat],
            }} />
            {cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
          </span>
        ))}
      </section>

      <section style={{
        maxWidth: '1100px', margin: '0 auto', padding: '1rem 2rem 3rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.25rem',
        }}>
          {pois.map(poi => (
            <div key={poi.id} style={{
              background: 'white', borderRadius: '14px',
              border: '1px solid #e8e8f0', padding: '1.15rem 1.25rem',
              cursor: 'pointer',
            }}>
              <span style={{
                display: 'inline-block', padding: '0.2rem 0.5rem',
                borderRadius: '6px', fontSize: '0.6rem', fontWeight: 800,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'white',
                background: categoryColors[poi.category] || '#8b8ba3',
                marginBottom: '0.5rem',
              }}>
                {poi.category}
              </span>

              <h3 style={{
                fontSize: '1.05rem', fontWeight: 700,
                marginBottom: '0.2rem', lineHeight: 1.3,
              }}>
                {poi.name}
              </h3>

              <p style={{
                fontSize: '0.72rem', color: '#8b8ba3', marginBottom: '0.35rem',
              }}>
                📍 {poi.county} County · {poi.nearest_highway}
              </p>

              <p style={{
                fontSize: '0.83rem', color: '#52526a',
                lineHeight: 1.55, marginBottom: '0.6rem',
              }}>
                {poi.tagline}
              </p>

              {poi.fun_fact && (
                <p style={{
                  fontSize: '0.73rem', color: '#6d665c', lineHeight: 1.5,
                  fontStyle: 'italic',
                  borderLeft: `3px solid ${categoryColors[poi.category] || '#ddd'}`,
                  paddingLeft: '0.7rem', marginBottom: '0.6rem',
                }}>
                  {poi.fun_fact}
                </p>
              )}

              <div style={{
                display: 'flex', gap: '0.75rem', paddingTop: '0.6rem',
                borderTop: '1px solid #f0f0f4',
                fontSize: '0.7rem', color: '#8b8ba3', fontWeight: 600,
              }}>
                {poi.visit_duration && <span>⏱ {poi.visit_duration}</span>}
                {poi.admission && <span>💰 {poi.admission}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{
        background: '#1e1e2d', color: 'rgba(255,255,255,0.4)',
        padding: '2rem', textAlign: 'center', fontSize: '0.8rem',
      }}>
        <p style={{ fontSize: '1.1rem', color: 'white', marginBottom: '0.4rem' }}>
          Open Road <span style={{ color: '#ff6b5b' }}>Guide</span>
        </p>
        <p>&copy; 2026 Open Road Guide. All rights reserved.</p>
      </footer>
    </main>
  )
}
