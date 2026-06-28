// Server component: fetch stories + states up front so the cards and chips ship
// as real HTML, then hand off to the interactive client layer. Metadata lives
// here now — the correct title is in the markup, not patched in after load.
import { createClient } from '@supabase/supabase-js';
import StoriesClient from './StoriesClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TITLE = 'Stories | Open Road Guide';
const DESC =
  'Long-reads about the places, people, and history that make the American West worth driving across.';
const URL = 'https://openroadguide.com/stories';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function StoriesPage() {
  const [{ data: storyData }, { data: stateData }] = await Promise.all([
    supabase
      .from('stories')
      .select('*, story_pois(pois(longitude, latitude))')
      .eq('published', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('states').select('slug, name').eq('published', true).order('sort_order', { ascending: true }),
  ]);

  const rows = storyData || [];
  const present = new Set(rows.map((s) => s.state).filter(Boolean));
  const options = (stateData || []).filter((s) => present.has(s.name));

  return <StoriesClient initialStories={rows} initialStateOptions={options} />;
}
