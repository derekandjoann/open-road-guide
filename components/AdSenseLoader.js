'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ADSENSE_CLIENT, adsAllowedPath } from '../lib/ads';

// Loads Google AdSense (Auto ads) only on pages where ads belong (lib/ads.js)
// and never on a page marked noindex (thin pages, 404s).
//
// The site changes pages without a full reload, and AdSense can't be
// unloaded once it runs. So when a visitor moves from a page with ads to a
// page that must stay ad-free (Plan a trip, Drive it, Search...), the page
// reloads once; the address (with any trip in it) is kept.
const SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

function isNoindex() {
  const m = document.querySelector('meta[name="robots"]');
  return Boolean(m && /noindex/i.test(m.getAttribute('content') || ''));
}

function adsLoaded() {
  return Boolean(document.querySelector('script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]'));
}

export default function AdSenseLoader() {
  const pathname = usePathname();

  useEffect(() => {
    // Let the page's metadata settle before reading its robots tag.
    const t = setTimeout(() => {
      const allowed = adsAllowedPath(pathname) && !isNoindex();
      if (!allowed) {
        if (adsLoaded() && !sessionStorageFlag(pathname)) window.location.reload();
        return;
      }
      if (adsLoaded()) return;
      const s = document.createElement('script');
      s.async = true;
      s.src = SRC;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }, 300);
    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}

// Guard against a reload loop if the script somehow survives the reload:
// skip a second reload of the same page within 10 seconds.
function sessionStorageFlag(pathname) {
  try {
    const k = `org:ads-reload:${pathname}`;
    const last = Number(window.sessionStorage.getItem(k) || 0);
    if (Date.now() - last < 10000) return true;
    window.sessionStorage.setItem(k, String(Date.now()));
  } catch {
    /* storage blocked: allow the reload */
  }
  return false;
}
