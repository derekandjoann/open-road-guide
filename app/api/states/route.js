import { createClient } from '@supabase/supabase-js';

// Server-only Supabase credentials.
//
// The fallback to the legacy NEXT_PUBLIC_* names is deliberate and temporary:
// it lets this file deploy safely BEFORE the new Netlify variables exist. Once
// SUPABASE_URL and SUPABASE_ANON_KEY are set in Netlify, delete the two
// NEXT_PUBLIC_* variables and drop the `||` fallbacks below. Nothing prefixed
// NEXT_PUBLIC_ can ever be inlined into a browser bundle again after that.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Run on the server for every request; the CDN in front does the caching.
export const dynamic = 'force-dynamic';

// Exactly the four columns the nav's state switcher renders — nothing else is
// reachable through this route, no matter what a caller asks for.
export async function GET() {
  const { data, error } = await supabase
    .from('states')
    .select('slug, name, status, sort_order')
    .eq('published', true)
    .eq('status', 'live')
    .order('sort_order', { ascending: true });

  // Graceful absence: an empty list renders the nav without the switcher,
  // which is the same thing the old client-side call did on failure.
  if (error) {
    return Response.json([], {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return Response.json(data ?? [], {
    headers: {
      // 5 min at the edge, serve-stale for an hour while revalidating. A new
      // state appears in the nav within ~5 minutes of going live, with no deploy.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
