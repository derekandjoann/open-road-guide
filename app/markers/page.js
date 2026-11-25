// Server component for /markers.
//
// It used to ask the database for every marker at once (23,000+ rows built
// into one blob). That query ran past the database's 3-second limit, came
// back empty, and the page said "No markers here yet." Now the server sends
// only the county index (one row per county, with counts); a county's
// markers and search results load on demand through /api/data.
import { createClient } from '@supabase/supabase-js';
import MarkersClient from './MarkersClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Rebuilt at most once an hour, so new markers show up without a deploy.
export const revalidate = 3600;

const TITLE = 'Historical Markers | Open Road Guide';
const DESC =
  'Roadside historical markers state by state and county by county, each with its story, its location and the stops nearby.';
const URL = 'https://openroadguide.com/markers';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function MarkersPage() {
  const [countRes, stateRes] = await Promise.all([
    // One bundled value, so the API's 1,000-row cap can't cut the list short.
    supabase.rpc('markers_county_index'),
    supabase.from('states').select('slug, name').eq('published', true).order('sort_order', { ascending: true }),
  ]);

  const counties = (Array.isArray(countRes.data) ? countRes.data : []).map(([state, county, count]) => ({
    state,
    county,
    count: Number(count) || 0,
  }));

  const present = new Set(counties.map((c) => c.state).filter(Boolean));
  const options = (stateRes.data || []).filter((s) => present.has(s.name));

  return <MarkersClient initialCounties={counties} initialStateOptions={options} />;
}
