export const metadata = {
  title: 'About | Open Road Guide',
  description:
    'Open Road Guide is an independent, research-first U.S. road-trip guide created by JoAnn — a curious traveler chronicling the history and stories behind the places along the way.',
  openGraph: {
    title: 'About | Open Road Guide',
    description:
      'An independent, research-first U.S. road-trip guide. Meet JoAnn and the standard behind every entry.',
    type: 'website',
  },
};

export default function AboutPage() {
  const p = {
    fontSize: '17px',
    lineHeight: 1.75,
    color: '#33333d',
    marginBottom: '22px',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', fontFamily: "'Outfit', sans-serif" }}>
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '56px 20px 64px' }}>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(30px, 6vw, 42px)',
            fontWeight: 800,
            color: '#1a1a2e',
            lineHeight: 1.15,
            marginBottom: '10px',
          }}
        >
          About Open Road Guide
        </h1>
        <p style={{ fontSize: '15px', color: '#888', marginBottom: '36px' }}>
          The story behind the guide — and the standard behind every entry.
        </p>

        <p style={p}>
          Open Road Guide began with a habit I have never been able to shake: I cannot drive past a
          place without wanting to know its story. The mountain that used to be a mine. The town the
          highway almost missed. The reason the road bends where it does. More often than not, the
          answer turns out to be more interesting than the view.
        </p>
        <p style={p}>
          I&apos;m JoAnn. I am not an institution or a tourism board — I am a curious traveler with an
          inquiring mind and a long-standing weakness for the history and geology hiding in plain
          sight along American roads. Open Road Guide is where I collect what I find.
        </p>
        <p style={p}>
          The aim is simple: build the road-trip guide I always wanted and could never quite find —
          one that tells you not just where to stop, but why the place is worth stopping for. Every
          point of interest and every story here is researched first and checked against real sources
          before it goes up. I would rather leave something out than make it up. Utah is the first
          state mapped in full; more of the country is on the way.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          If you spot an error, know a story I have missed, or just want to talk roads, write to me at{' '}
          <a
            href="mailto:joann@openroadguide.com"
            style={{ color: '#ff6b5b', fontWeight: 600, textDecoration: 'none' }}
          >
            joann@openroadguide.com
          </a>
          . I read everything.
        </p>
      </main>

      <footer style={{ background: '#1a1a2e', padding: '40px 20px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: '20px',
            fontWeight: 800,
            color: '#ff6b5b',
            marginBottom: '8px',
          }}
        >
          Open Road Guide
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', maxWidth: '400px', margin: '0 auto' }}>
          Built with love for the open road. More states coming soon.
        </p>
      </footer>
    </div>
  );
}
