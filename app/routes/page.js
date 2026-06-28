// Server component: fetch routes + states up front so the cards and chips ship
// as real HTML, then hand off to the interactive client layer. Metadata lives
// here now — the correct title is in the markup, not patched in after load.
import { createClient } from '@supabase/supabase-js';
import RoutesClient from './RoutesClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Must match RoutesClient's palette exactly so each route's color stays stable
// between its server-assigned card and its client-rendered map line.
const ROUTE_COLORS = [
  '#FF6B6B', '#F2884B', '#E3A019', '#8DA63C', '#3F9E6E', '#2FB3A8',
  '#3E9CC0', '#3E6FB0', '#6A5BAE', '#9D4EDD', '#B5468A', '#C24E6A',
];

// A route belongs to a state if it's the primary state OR appears in crossing_states[].
function routeInState(route, stateName) {
  if (route.state === stateName) return true;
  return Array.isArray(route.crossing_states) && route.crossing_states.includes(stateName);
}

const TITLE = 'Routes | Open Road Guide';
const DESC =
  'Long-form road trip guides through the American West — every stop, every story, every mile that makes the drive worth taking.';
const URL = 'https://openroadguide.com/routes';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function RoutesPage() {
  const [{ data: routeData }, { data: stateData }] = await Promise.all([
    supabase.from('routes').select('*').eq('published', true).order('name', { ascending: true }),
    supabase.from('states').select('slug, name').eq('published', true).order('sort_order', { ascending: true }),
  ]);

  const withColor = (routeData || []).map((r, i) => ({
    ...r,
    _color: ROUTE_COLORS[i % ROUTE_COLORS.length],
  }));

  // A chip for any state with at least one belonging route (primary or crossing).
  const options = (stateData || []).filter((s) => withColor.some((r) => routeInState(r, s.name)));

  return <RoutesClient initialRoutes={withColor} initialStateOptions={options} />;
}
