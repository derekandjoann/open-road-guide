'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { navLinks, isNavLinkActive } from '../lib/navLinks';
import { supabase } from '../lib/supabase';

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
  switchBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '999px',
    padding: '6px 14px', fontSize: '14px', fontWeight: 600, color: '#1a1a2e',
    cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
  },
  menu: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: '200px',
    background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 12px 32px rgba(26,26,46,0.18)', padding: '6px', zIndex: 200,
    listStyle: 'none', margin: 0,
  },
};

// Dark nav — the consolidated header for DESKTOP, used site-wide.
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
  switchBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px',
    padding: '6px 14px', fontSize: '14px', fontWeight: 600, color: '#fff',
    cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
  },
  menu: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: '200px',
    background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: '6px', zIndex: 200,
    listStyle: 'none', margin: 0,
  },
};

// Shared menu-item styling (the menu card is white in both themes).
const menuItem = {
  display: 'block', padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
  fontSize: '14px', fontWeight: 500, color: '#1a1a2e', whiteSpace: 'nowrap',
};
const menuItemActive = { ...menuItem, fontWeight: 700, color: '#FF6B6B', background: 'rgba(255,107,91,0.08)' };
const menuHint = { padding: '4px 12px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600 };

function StateSwitcher({ states, currentSlug, theme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const s = theme;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!states || states.length === 0) return null;

  const current = states.find((st) => st.slug === currentSlug);
  const label = current ? current.name : 'States';

  return (
    <li ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        style={s.switchBtn}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span style={{ fontSize: '11px', opacity: 0.8 }}>▾</span>
      </button>
      {open && (
        <ul style={s.menu}>
          <li style={menuHint}>Explore by state</li>
          {states.map((st) => (
            <li key={st.slug}>
              <Link
                href={`/${st.slug}`}
                style={st.slug === currentSlug ? menuItemActive : menuItem}
                onClick={() => setOpen(false)}
              >
                {st.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [states, setStates] = useState([]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Live states drive the switcher — add a state in the DB and it appears here
  // with no code change.
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from('states')
        .select('slug, name, status, sort_order')
        .eq('published', true)
        .eq('status', 'live')
        .order('sort_order', { ascending: true });
      if (active && data) setStates(data);
    }
    load();
    return () => { active = false; };
  }, []);

  // Desktop + explore: the explore page draws its own consolidated dark bar.
  if (!isMobile && pathname === '/explore') return null;

  const s = isMobile ? cream : dark;
  // Current state = the first path segment when it matches a known state slug.
  const firstSeg = (pathname || '/').split('/')[1] || '';
  const currentSlug = states.some((st) => st.slug === firstSeg) ? firstSeg : '';

  return (
    <nav style={s.nav}>
      <Link href="/" style={s.logo}>
        Open Road Guide
      </Link>
      <ul style={s.links}>
        <StateSwitcher states={states} currentSlug={currentSlug} theme={s} />
        {navLinks.map((link) => {
          const isActive = isNavLinkActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link href={link.href} style={isActive ? s.linkActive : s.link}>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
