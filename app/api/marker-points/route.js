import { supabase } from '../../../lib/supabase';

// Every live marker as a map dot, in the lightest shape that works:
//   [longitude, latitude, slug-or-null, name]
// slug is filled only when the marker has its own page (/marker/<slug>).
//
// This route has its own path (no query string), so the CDN can cache it
// safely: one copy serves every visitor for an hour, and the database is
// asked again at most once an hour.
export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabase.rpc('markers_points');
  if (error || !Array.isArray(data)) {
    return Response.json([], { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(data, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=600',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
