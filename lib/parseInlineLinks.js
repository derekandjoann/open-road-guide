// lib/parseInlineLinks.jsx
//
// Shared helper used by both the story renderer (app/story/[slug]/page.jsx)
// and the POI renderer (app/poi/[slug]/page.jsx) to parse inline
// [text](url) markdown links inside a block of prose.
//
// External URLs (http/https) render as <a target="_blank" rel="noopener noreferrer">.
// Internal paths (/...) render as Next.js <Link> for client-side navigation.
//
// Returns an array of strings and React elements suitable for splatting
// into a parent element with {...} in JSX.
//
// Returns [] for null/undefined/empty input so callers can map safely.

import Link from 'next/link';

const CORAL = '#FF6B6B';

export function parseInlineLinks(text) {
  if (!text) return [];

  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const [, linkText, url] = match;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      out.push(
        <a
          key={`l${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: CORAL, textDecoration: 'underline' }}
        >
          {linkText}
        </a>
      );
    } else {
      out.push(
        <Link
          key={`l${key++}`}
          href={url}
          style={{ color: CORAL, textDecoration: 'underline' }}
        >
          {linkText}
        </Link>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out.length > 0 ? out : [text];
}
