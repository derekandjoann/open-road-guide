'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/explore', label: 'Explore' },
  { href: '/routes', label: 'Routes' },
  { href: '/regions', label: 'Regions' },
  { href: '/stories', label: 'Stories' },
];

const styles = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backgroundColor: '#FFF8F0',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
    fontFamily: "'Outfit', sans-serif",
  },
  logo: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 700,
    fontSize: '20px',
    color: '#1a1a2e',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '28px',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  link: {
    color: '#1a1a2e',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 500,
    paddingBottom: '4px',
    borderBottom: '2px solid transparent',
    transition: 'border-color 0.15s ease',
  },
  linkActive: {
    color: '#1a1a2e',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 600,
    paddingBottom: '4px',
    borderBottom: '2px solid #FF6B6B',
  },
};

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav}>
      <Link href="/" style={styles.logo}>
        Open Road Guide
      </Link>
      <ul style={styles.links}>
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                style={isActive ? styles.linkActive : styles.link}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
