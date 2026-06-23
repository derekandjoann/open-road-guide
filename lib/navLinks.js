// Single source of truth for the site's primary section navigation.
//
// Both the global <Nav> (components/nav.js) and the Explore page's own
// consolidated dark bar (app/explore/page.js) import this list and map over
// it. Adding a sixth section — or relabeling one — now happens in exactly one
// place and can never drift between the two headers again.

export const navLinks = [
  { href: '/map', label: 'Map' },
  { href: '/explore', label: 'Explore' },
  { href: '/routes', label: 'Routes' },
  { href: '/regions', label: 'Regions' },
  { href: '/stories', label: 'Stories' },
];

// Shared active-state test so every header agrees on what "current section"
// means: an exact match, or any deeper path inside that section
// (e.g. /stories/dewey-bridge highlights Stories).
export function isNavLinkActive(pathname, href) {
  return pathname === href || pathname.startsWith(href + '/');
}
