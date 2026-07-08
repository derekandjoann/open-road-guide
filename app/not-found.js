import Link from 'next/link';

// Site-wide 404. Every notFound() call (undescribed marker slugs, unknown
// routes) lands here with a real 404 status and a screen that looks like the
// rest of the guide rather than Next's default. Noindex so crawlers don't
// bank the dead URL.
export const metadata = {
  title: { absolute: 'Page not found | Open Road Guide' },
  robots: { index: false, follow: true },
};

const COLORS = {
  coral: '#FF6B6B',
  violet: '#9D4EDD',
  ink: '#1a1a2e',
  warmGray: '#666',
};

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/markers', label: 'Historical markers' },
  { href: '/routes', label: 'Scenic drives' },
  { href: '/stories', label: 'Stories' },
];

export default function NotFound() {
  return (
    <main style={styles.main}>
      <div style={styles.eyebrow}>404</div>
      <h1 style={styles.title}>This road doesn&apos;t go through.</h1>
      <p style={styles.body}>
        The page you were after isn&apos;t here — moved, unpublished, or a slug
        that never existed. Everything we&apos;ve actually mapped is a tap away.
      </p>
      <nav style={styles.links}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} style={styles.link}>
            {l.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

const styles = {
  main: {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: 'clamp(3rem, 10vw, 6rem) clamp(1rem, 4vw, 2.5rem)',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.ink,
    textAlign: 'center',
  },
  eyebrow: {
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    color: COLORS.violet,
    marginBottom: '1rem',
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(2rem, 6vw, 3rem)',
    fontWeight: 600,
    lineHeight: 1.1,
    margin: '0 0 1.25rem 0',
    color: COLORS.ink,
  },
  body: {
    fontSize: '1.1rem',
    lineHeight: 1.7,
    color: COLORS.warmGray,
    margin: '0 auto 2.5rem auto',
    maxWidth: '32rem',
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    justifyContent: 'center',
  },
  link: {
    color: COLORS.coral,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '1.02rem',
  },
};
