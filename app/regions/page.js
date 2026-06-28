// Server component: fetch regions + states at request/build time so the grid and
// state chips arrive as real HTML (crawlable, instant on slow phones), then hand
// the data to the interactive client layer. Metadata lives here too — no more
// client-side document.title patching, so the correct title ships in the markup.
import { createClient } from '@supabase/supabase-js';
import RegionsClient from './RegionsClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Must match RegionsClient's palette exactly so each region's color is stable
// between the server-assigned card and its client-rendered map piece.
const REGION_COLORS = [
  '#C1432E', '#D9772B', '#C99A2E', '#7E8A2E', '#4F8F4A', '#2E9E83', '#3E9CC0',
  '#3E6FB0', '#6A5BAE', '#8E4FA0', '#B5468A', '#C24E6A', '#7C6A55', '#5B8C7B',
];

const TITLE = 'Regions | Open Road Guide';
const DESC =
  'Explore the American West by region — each one gathers the parks, towns, scenic drives, and roadside stops that define a single corner of the map.';
const URL = 'https://openroadguide.com/regions';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function RegionsPage() {
  const [{ data: regionData }, { data: stateData }] = await Promise.all([
    supabase
      .from('regions')
      .select('*, region_pois(pois(longitude, latitude))')
      .eq('published', true)
      .order('name', { ascending: true }),
    supabase
      .from('states')
      .select('slug, name')
      .eq('published', true)
      .order('sort_order', { ascending: true }),
  ]);

  // Color by name-sorted index over the FULL set, before any state lens, so a
  // region's hue never shifts when filtered (mirrors the old client logic).
  const withColor = (regionData || []).map((r, i) => ({
    ...r,
    _color: REGION_COLORS[i % REGION_COLORS.length],
  }));

  // Only offer a state chip for states that actually have published regions.
  const present = new Set(withColor.map((r) => r.state).filter(Boolean));
  const options = (stateData || []).filter((s) => present.has(s.name));

  return <RegionsClient initialRegions={withColor} initialStateOptions={options} />;
}
