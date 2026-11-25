'use client';

// "Show more" button for long lists: the page draws the first batch, and each
// tap adds another, so a phone isn't asked to lay out hundreds of cards (and
// download hundreds of images) at once.
export default function ShowMore({ shown, total, onMore, label = 'Show more' }) {
  if (shown >= total) return null;
  return (
    <div style={{ textAlign: 'center', margin: '2rem 0 1rem' }}>
      <button
        type="button"
        onClick={onMore}
        style={{
          background: '#1a1a2e',
          color: '#fff',
          border: 'none',
          borderRadius: '999px',
          padding: '0.8rem 1.6rem',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {label} ({(total - shown).toLocaleString('en-US')} more)
      </button>
    </div>
  );
}
