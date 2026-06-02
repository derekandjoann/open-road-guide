export const metadata = {
  title: 'Privacy Policy | Open Road Guide',
  description:
    'How Open Road Guide handles visitor information. The short version: no accounts, no newsletter, no analytics, no ads, and no tracking cookies.',
  openGraph: {
    title: 'Privacy Policy | Open Road Guide',
    description: 'How Open Road Guide handles visitor information — we collect as little as possible.',
    type: 'website',
  },
};

export default function PrivacyPage() {
  const p = { fontSize: '16px', lineHeight: 1.7, color: '#33333d', marginBottom: '18px' };
  const h2 = {
    fontFamily: "'Fraunces', serif",
    fontSize: 'clamp(20px, 4vw, 24px)',
    fontWeight: 800,
    color: '#1a1a2e',
    marginTop: '36px',
    marginBottom: '12px',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', fontFamily: "'Outfit', sans-serif" }}>
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '56px 20px 64px' }}>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(28px, 6vw, 40px)',
            fontWeight: 800,
            color: '#1a1a2e',
            lineHeight: 1.15,
            marginBottom: '8px',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ fontSize: '14px', color: '#888', marginBottom: '32px' }}>Last updated: June 1, 2026</p>

        <p style={p}>
          Open Road Guide (&quot;we,&quot; or &quot;the site&quot;) is an independent travel-guide website
          operated from the United States (Utah). This page explains what information the site does and
          does not collect. The short version: we collect as little as possible, and we never sell or
          share your personal information.
        </p>

        <h2 style={h2}>What we collect</h2>
        <p style={p}>
          Open Road Guide does not ask you for personal information. There are no accounts, no sign-up
          forms, no newsletter, and no comments. We do not run advertising, and we do not use analytics
          trackers or tracking cookies.
        </p>

        <h2 style={h2}>Information handled by our service providers</h2>
        <p style={p}>
          To deliver the site to your screen, your browser connects to a few third-party services. In the
          ordinary course of loading any website, these services may automatically process standard
          technical information — such as your IP address, browser type, and which pages you request. The
          site relies on:
        </p>
        <ul style={{ ...p, paddingLeft: '22px' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Netlify</strong>, which hosts the site and serves its pages.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Supabase</strong>, which stores the guide&apos;s content and the images your browser
            loads as you read.
          </li>
          <li>
            <strong>Map tiles</strong> from MapLibre and OpenStreetMap, which load only when an interactive
            map is shown.
          </li>
        </ul>
        <p style={p}>
          Each provider handles that technical data under its own privacy practices. We do not combine it,
          store it ourselves, or use it to identify you.
        </p>

        <h2 style={h2}>Cookies</h2>
        <p style={p}>The site does not use cookies to track or profile visitors.</p>

        <h2 style={h2}>Children</h2>
        <p style={p}>
          Open Road Guide is a general-audience travel site and is not directed to children under 13. We do
          not knowingly collect personal information from children.
        </p>

        <h2 style={h2}>Changes to this policy</h2>
        <p style={p}>
          If the site ever adds something that changes how information is handled — analytics, a newsletter,
          or similar — we will update this page and the date above before that change takes effect.
        </p>

        <h2 style={h2}>Contact</h2>
        <p style={{ ...p, marginBottom: 0 }}>
          Questions about privacy? Email{' '}
          <a
            href="mailto:joann@openroadguide.com"
            style={{ color: '#ff6b5b', fontWeight: 600, textDecoration: 'none' }}
          >
            joann@openroadguide.com
          </a>
          .
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
