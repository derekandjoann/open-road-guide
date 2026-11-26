// Along the Way: each interstate and US highway, state by state.
//
// Lines come from the Census Bureau's TIGER 2024 primary and secondary roads
// (one shape per highway and state), driven through OpenStreetMap's router so
// gaps where two routes share pavement are filled. They live in
// public.highway_states; public.along_highway(slug, state_slug) returns one
// segment's places and told markers in road order.

import { tripToQuery } from './trip';

// A segment is indexed when it has at least this many pages of its own to
// point to (places plus markers with write-ups) and at least one place.
// The count and the flag are stored on the row (indexable) when lines load.
export const ALONG_INDEX_MIN = 8;

// "Interstate 70" -> "I-70"; "US Highway 89" -> "US 89"
export function shortName(slug) {
  const m = /^(i|us)-(\w+)$/.exec(slug || '');
  if (!m) return slug;
  return m[1] === 'i' ? `I-${m[2].toUpperCase()}` : `US ${m[2].toUpperCase()}`;
}

export function plural(n, one, many) {
  return `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

// A Chart My Course link for one segment, end to end.
export function planLinkFor(seg) {
  const line = seg.line || [];
  if (line.length < 2) return null;
  const a = line[0];
  const b = line[line.length - 1];
  const name = shortName(seg.highway_slug);
  return `/plan?${tripToQuery({
    from: { lng: a[0], lat: a[1], label: seg.from_label ? `${name} at ${seg.from_label}` : `${name} start` },
    to: { lng: b[0], lat: b[1], label: seg.to_label ? `${name} at ${seg.to_label}` : `${name} end` },
    stops: [],
    hours: 6,
  })}`;
}

// Sort key for highways: interstates first, then US highways, by number.
export function highwayOrder(a, b) {
  if (a.kind !== b.kind) return a.kind === 'interstate' ? -1 : 1;
  if (a.num !== b.num) return a.num - b.num;
  return String(a.highway_slug).localeCompare(String(b.highway_slug));
}
