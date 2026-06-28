// Server component: fetch POIs + states up front so the stop list and category
// chips arrive as real HTML, then hand the data to the interactive client layer
// (map, filters, search). Metadata lives here, replacing the old default title.
import { createClient } from '@supabase/supabase-js';
import ExploreClient from './ExploreClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TITLE = 'Explore the Map | Open Road Guide';
const DESC =
  'Every roadside stop across the American West on one interactive map — filter by state and category, search by name, and find what is worth pulling over for.';
const URL = 'https://openroadguide.com/explore';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function ExplorePage() {
  const [poiRes, stateRes] = await Promise.all([
    supabase.from('pois').select('*').order('name'),
    supabase.from('states').select('slug, name').eq('published', true).order('sort_order', { ascending: true }),
  ]);

  const pois = poiRes.data || [];
  const present = new Set(pois.map((p) => p.state).filter(Boolean));
  const options = (stateRes.data || []).filter((s) => present.has(s.name));

  return <ExploreClient initialPois={pois} initialStateOptions={options} />;
}
