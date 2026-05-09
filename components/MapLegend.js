'use client';

import { getCategoryColor } from '../lib/categoryColors';

export default function MapLegend({ categories = [] }) {
  if (categories.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px 18px',
      padding: '12px 0',
    }}>
      {categories.map((cat) => {
        const color = getCategoryColor(cat);
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        return (
          <div key={cat} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: color,
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              color: '#444',
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
