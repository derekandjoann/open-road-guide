import { supabase } from '../lib/supabase';

const BASE = 'https://openroadguide.com';

// Pull every published row for a table; never let a transient DB error
// fail the whole build — fall back to an empty list and keep the rest.
async function fetchRows(table) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('slug, updated_at')
      .eq('published', true);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error(`sitemap: failed to load "${table}":`, e?.message || e);
    return [];
  }
}

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

  const [pois, stories, routes, regions, states] = await Promise.all([
    fetchRows('pois'),
    fetchRows('stories'),
    fetchRows('routes'),
    fetchRows('regions'),
    fetchRows('states'),
  ]);

  // State hubs live at the top level (/utah, /nevada). High priority — they're
  // the front door for each state.
  const stateHubs = states.map((row) => ({
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
    ...pois.map(toEntry('poi', 0.7, 'monthly')),
    ...routes.map(toEntry('route', 0.7, 'monthly')),
    ...regions.map(toEntry('region', 0.7, 'monthly')),
    ...stories.map(toEntry('story', 0.6, 'monthly')),
  ];
}
