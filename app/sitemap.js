import { supabase } from '../lib/supabase';

const BASE = 'https://openroadguide.com';

// Regenerate the sitemap at most once a day (ISR) rather than baking it once at
// build time. Marker prose lands in Supabase continuously as the writing
// campaign rolls, and every content table grows between deploys; without this,
// newly described markers and new POIs/stories stay out of the sitemap until the
// next manual deploy. A daily rebuild keeps discovery current on its own — the
// pages themselves already resolve the moment their prose exists.
export const revalidate = 86400;

// PostgREST returns at most 1000 rows per request. Content tables are
// already past that in aggregate (described markers alone will be), so every
// fetch pages until it comes up short.
const PAGE = 1000;

// Pull every matching row for a table, paging past the row cap; never let a
// transient DB error fail the whole build — fall back to an empty list and
// keep the rest.
async function fetchAll(table, columns, applyFilters) {
  const rows = [];
  try {
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from(table)
        .select(columns)
        .range(from, from + PAGE - 1);
      if (applyFilters) query = applyFilters(query);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    console.error(`sitemap: failed to load "${table}":`, e?.message || e);
  }
  return rows;
}

const published = (q) => q.eq('published', true);

// Only described markers have pages — the quality bar is the point. Markers
// carry no updated_at column, so their entries take the build date.
const describedMarkers = (q) =>
  q
    .not('slug', 'is', null)
    .not('description', 'is', null)
    .neq('description', '');

// Only tags with editorial prose get sitemap entries — that's the ≥5-item set
// we've written; blank tags stay out until they earn a description.
const describedTags = (q) =>
  q
    .not('slug', 'is', null)
    .not('description', 'is', null)
    .neq('description', '');

export default async function sitemap() {
  const now = new Date();

  const staticPages = [
    { url: `${BASE}`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/explore`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/routes`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/regions`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/stories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/markers`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const [pois, stories, routes, regions, states, markers, tags, itineraries, trails] = await Promise.all([
    fetchAll('pois', 'slug, updated_at', published),
    fetchAll('stories', 'slug, updated_at', published),
    fetchAll('routes', 'slug, updated_at', published),
    fetchAll('regions', 'slug, updated_at', published),
    fetchAll('states', 'slug, updated_at', published),
    fetchAll('markers', 'slug', describedMarkers),
    fetchAll('tags', 'slug, updated_at', describedTags),
    fetchAll('itineraries', 'slug, updated_at', published),
    fetchAll('trails', 'slug, updated_at', published),
  ]);

  // State hubs live at the top level (/utah, /nevada). High priority — they're
  // the front door for each state.
  const stateHubs = states
    .filter((row) => row.slug)
    .map((row) => ({
      url: `${BASE}/${row.slug}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.9,
    }));

  const toEntry = (prefix, priority, changeFrequency) => (row) => ({
    url: `${BASE}/${prefix}/${row.slug}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : now,
    changeFrequency,
    priority,
  });

  return [
    ...staticPages,
    ...stateHubs,
    ...itineraries.filter((r) => r.slug).map(toEntry('itinerary', 0.8, 'monthly')),
    ...trails.filter((r) => r.slug).map(toEntry('trail', 0.8, 'monthly')),
    ...pois.filter((r) => r.slug).map(toEntry('poi', 0.7, 'monthly')),
    ...routes.filter((r) => r.slug).map(toEntry('route', 0.7, 'monthly')),
    ...regions.filter((r) => r.slug).map(toEntry('region', 0.7, 'monthly')),
    ...stories.filter((r) => r.slug).map(toEntry('story', 0.6, 'monthly')),
    ...markers.filter((r) => r.slug).map(toEntry('marker', 0.6, 'yearly')),
    ...tags.filter((r) => r.slug).map(toEntry('tag', 0.5, 'monthly')),
  ];
}
