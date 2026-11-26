// Town names and links, matching the database's town_key() function.
//   "Nashville (Midtown)"           -> "nashville"
//   "Kane County, Unincorporated"   -> null (not a town)
// Town pages live at /town/<state-slug>/<town-slug> and exist for towns with
// at least TOWN_PAGE_MIN stops (places plus markers with write-ups).

export const TOWN_PAGE_MIN = 3;
// Indexed from this many stops; thinner town pages are noindex,follow.
export const TOWN_INDEX_MIN = 8;

const NOT_A_TOWN = /(county|unincorporated|vicinity|\bline\b|\brte\b|\bnear\b|,|\/|\d)/i;
// Parks a place sometimes names as its "nearest city". They have their own
// place pages; a town page for them would be a duplicate.
const PARK = /(national park|national monument|state park|national forest|recreation area)/i;

export function isTownName(raw) {
  const n = townName(raw);
  return Boolean(n) && !NOT_A_TOWN.test(n) && !PARK.test(n);
}

export function townName(raw) {
  return String(raw || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

export function townSlug(raw) {
  const n = townName(raw);
  if (!isTownName(n)) return null;
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}
