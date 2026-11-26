import Link from 'next/link';

// "Make this trip mine": opens Chart My Course with this route's or
// itinerary's stops already in it, ready to change, save and share.
export default function MakeTripMine({ href, note }) {
  if (!href) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', margin: '1rem 0 1.5rem' }}>
      <Link
        href={href}
        prefetch={false}
        style={{
          display: 'inline-block',
          background: '#1a1a2e',
          color: '#fff',
          borderRadius: '999px',
          padding: '0.7rem 1.3rem',
          fontWeight: 600,
          fontSize: '0.95rem',
          textDecoration: 'none',
          fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        Make this trip mine →
      </Link>
      <span style={{ fontSize: '0.88rem', color: '#666', fontFamily: "'Outfit', sans-serif" }}>
        {note || 'Add or drop stops, split it into days, then save, share or send it to your maps app.'}
      </span>
    </div>
  );
}
