// Site-wide footer — the first one the site has had.
//
// Three jobs: (1) give every template a path to About, Privacy, and Contact
// (they existed but were unlinked from anywhere); (2) repeat the core
// navigation for people who read to the bottom; (3) carry the Mile Markers
// newsletter signup site-wide. Server component, no interactivity beyond the
// plain-HTML form inside MileMarkersSignup.
//
// Dark ink gradient mirrors the desktop nav so the page is bookended.

import Link from 'next/link';
import MileMarkersSignup from './MileMarkersSignup';

const COLORS = {
  coral: '#ff6b5b',
  ink: '#1a1a2e',
};

const s = {
  footer: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: 'rgba(255,255,255,0.72)',
    fontFamily: "'Outfit', sans-serif",
    marginTop: '4rem',
  },
  inner: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: 'clamp(2.5rem, 6vw, 3.5rem) clamp(1rem, 4vw, 2.5rem) 1.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'clamp(2rem, 5vw, 4rem)',
  },
  brandCol: { flex: '1 1 260px', minWidth: '240px' },
  logo: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 800,
    fontSize: '21px',
    color: COLORS.coral,
    textDecoration: 'none',
    letterSpacing: '-0.01em',
    display: 'inline-block',
    marginBottom: '0.75rem',
  },
  brandBlurb: {
    fontSize: '0.92rem',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '22rem',
    color: 'rgba(255,255,255,0.6)',
  },
  linksCol: { flex: '0 1 auto', minWidth: '150px' },
  colHeading: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.45)',
    margin: '0 0 0.9rem 0',
  },
  linkList: { listStyle: 'none', margin: 0, padding: 0 },
  linkItem: { marginBottom: '0.6rem' },
  link: {
    color: 'rgba(255,255,255,0.72)',
    textDecoration: 'none',
    fontSize: '0.95rem',
  },
  signupCol: { flex: '1 1 300px', minWidth: '260px' },
  bottomBar: {
    borderTop: '1px solid rgba(255,255,255,0.12)',
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '1.25rem clamp(1rem, 4vw, 2.5rem) 2rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem 1.5rem',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.45)',
  },
  bottomLinks: { display: 'flex', flexWrap: 'wrap', gap: '1.25rem' },
  bottomLink: { color: 'rgba(255,255,255,0.55)', textDecoration: 'none' },
};

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={s.footer}>
      <div style={s.inner}>
        <div style={s.brandCol}>
          <Link href="/" style={s.logo}>
            Open Road Guide
          </Link>
          <p style={s.brandBlurb}>
            An editorial road-trip guide to the American West — the drives, the
            places, and the roadside history worth pulling over for. Researched,
            written, and driven one state at a time.
          </p>
        </div>

        <nav style={s.linksCol} aria-label="Footer">
          <h2 style={s.colHeading}>Explore</h2>
          <ul style={s.linkList}>
            <li style={s.linkItem}>
              <Link href="/explore" style={s.link}>The Map</Link>
            </li>
            <li style={s.linkItem}>
              <Link href="/routes" style={s.link}>Scenic Drives</Link>
            </li>
            <li style={s.linkItem}>
              <Link href="/stories" style={s.link}>Stories</Link>
            </li>
            <li style={s.linkItem}>
              <Link href="/regions" style={s.link}>Regions</Link>
            </li>
            <li style={s.linkItem}>
              <Link href="/markers" style={s.link}>Historical Markers</Link>
            </li>
          </ul>
        </nav>

        <div style={s.signupCol}>
          <MileMarkersSignup variant="footer" />
        </div>
      </div>

      <div style={s.bottomBar}>
        <div>© {year} Open Road Guide</div>
        <div style={s.bottomLinks}>
          <Link href="/about" style={s.bottomLink}>About</Link>
          <Link href="/privacy" style={s.bottomLink}>Privacy</Link>
          <a href="mailto:joann@openroadguide.com" style={s.bottomLink}>Contact</a>
        </div>
      </div>
    </footer>
  );
}
