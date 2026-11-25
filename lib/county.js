// County names and links, matching the database's county_slug() function.
//   "Travis"           -> "travis"
//   "St. Landry Parish" -> "st-landry"
// County pages live at /county/<state-slug>/<county-slug>.

export function countyBase(name) {
  return String(name || '')
    .trim()
    .replace(/\s+(county|parish|borough)$/i, '')
    .trim();
}

export function countySlug(name) {
  return countyBase(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Louisiana has parishes; everywhere else on the site has counties.
export function countyLabel(name, state) {
  const base = countyBase(name);
  if (!base || base === 'Unknown') return null;
  return `${base} ${state === 'Louisiana' ? 'Parish' : 'County'}`;
}

export function stateSlugOf(stateName) {
  return String(stateName || '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function countyHref(stateName, county) {
  const cs = countySlug(county);
  if (!cs || cs === 'unknown' || !stateName) return null;
  return `/county/${stateSlugOf(stateName)}/${cs}`;
}

// A county page is worth indexing when it has at least this many pages of
// its own to point to (places plus markers with write-ups). Thinner county
// pages still work for visitors but tell search engines not to index them.
export const COUNTY_INDEX_MIN = 3;
