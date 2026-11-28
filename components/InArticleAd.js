'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ADSENSE_CLIENT, adsAllowedPath } from '../lib/ads';

// One AdSense in-article ad (unit "ORG in-article", slot 7448704933), placed
// by hand between paragraphs or sections of reading pages. The AdSense script
// itself is loaded by AdSenseLoader on allowed pages only; this slot renders
// nothing on ad-free or noindex pages.
//
// Space is reserved while the ad loads so the text doesn't jump (layout
// shift hurts search ranking). If Google has no ad to show, the slot
// collapses (AdSense marks it data-ad-status="unfilled"; see the style below).
export const IN_ARTICLE_SLOT = '7448704933';

export default function InArticleAd({ slot = IN_ARTICLE_SLOT, style }) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const pushed = useRef(false);
  const ref = useRef(null);

  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]');
    const noindex = Boolean(robots && /noindex/i.test(robots.getAttribute('content') || ''));
    setShow(adsAllowedPath(pathname) && !noindex);
  }, [pathname]);

  useEffect(() => {
    if (!show || pushed.current || !ref.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blockers and the like: nothing to do */
    }
  }, [show]);

  if (!show) return null;

  return (
    <aside aria-label="Advertisement" className="org-ad no-print" style={{ margin: '32px 0', ...style }}>
      <style>{`.org-ad:has(ins[data-ad-status="unfilled"]){display:none}`}</style>
      <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#999', textAlign: 'center', marginBottom: '6px' }}>
        Advertisement
      </div>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block', textAlign: 'center', minHeight: '250px' }}
        data-ad-layout="in-article"
        data-ad-format="fluid"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </aside>
  );
}
