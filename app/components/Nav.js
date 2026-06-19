'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const links = [
  { href: '/explore', label: 'Explore' },
  { href: '/routes', label: 'Routes' },
  { href: '/regions', label: 'Regions' },
  { href: '/stories', label: 'Stories' },
];

// Cream nav — the original, kept verbatim for MOBILE on every page so the phone
// experience is unchanged (the explore page still pins its sticky map under the
// 94px-tall wrapped cream bar exactly as before).
const cream = {
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
  links: { display: 'flex', alignItems: 'center', gap: '28px', listStyle: 'none', margin: 0, padding: 0 },
  link: { color: '#1a1a2e', textDecoration: 'none', fontSize: '15px', fontWeight: 500, paddingBottom: '4px', borderBottom: '2px solid transparent', transition: 'border-color 0.15s ease' },
  linkActive: { color: '#1a1a2e', textDecoration: 'none', fontSize: '15px', fontWeight: 600, paddingBottom: '4px', borderBottom: '2px solid #FF6B6B' },
};

// Dark nav — the consolidated header for DESKTOP, used site-wide. Wordmark and
// tabs are grouped on the left so they line up across every page. On the explore
// page the page itself renders the dark bar (so it can also hold the search),
// so this component returns null there to avoid stacking two headers.
const dark = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderBottom: '1px solid rgba(0,0,0,0.2)',
    padding: '16px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: '34px',
    fontFamily: "'Outfit', sans-serif",
  },
  logo: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 800,
    fontSize: '21px',
    color: '#ff6b5b',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
    flex: '0 0 auto',
  },
  links: { display: 'flex', alignItems: 'center', gap: '28px', listStyle: 'none', margin: 0, padding: 0 },
  link: { color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: '15px', fontWeight: 500, paddingBottom: '4px', borderBottom: '2px solid transparent', transition: 'all 0.15s ease' },
  linkActive: { color: '#ff6b5b', textDecoration: 'none', fontSize: '15px', fontWeight: 600, paddingBottom: '4px', borderBottom: '2px solid #ff6b5b' },
};

export default function Nav() {
  const pathname = usePathname();
  // Initial false = desktop-first paint, matching the explore page's own
  // matchMedia pattern; flips on mount and on rotation/resize.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Desktop + explore: the explore page draws its own consolidated dark bar
  // (wordmark + tabs + search), so the global nav steps aside there.
  if (!isMobile && pathname === '/explore') return null;

  const s = isMobile ? cream : dark;

  return (
    <nav style={s.nav}>
      <Link href="/" style={s.logo}>
        Open Road Guide
      </Link>
      <ul style={s.links}>
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                style={isActive ? s.linkActive : s.link}
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
