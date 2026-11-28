// Where Google AdSense may run. JoAnn's rules (2026-11-27):
//   ads on reading pages: markers, places, stories, routes, itineraries,
//   regions, state, county, town and highway pages, tags, trails, the home
//   page and the story, route and region lists;
//   never on tools (Chart My Course, Drive Mode, Search, Near me, the map,
//   Explore, the Markers finder), the about and privacy pages, error pages,
//   or any page that tells search engines not to index it (thin county,
//   town and highway pages, 404s).
export const ADSENSE_CLIENT = 'ca-pub-5630628197846834';

const NO_ADS_TOP = new Set(['drive', 'plan', 'search', 'near', 'map', 'explore', 'markers', 'about', 'privacy', 'api']);

export function adsAllowedPath(pathname) {
  const path = String(pathname || '/').split('?')[0];
  if (path === '/') return true;
  const first = path.replace(/^\/+/, '').split('/')[0].toLowerCase();
  return Boolean(first) && !NO_ADS_TOP.has(first);
}
