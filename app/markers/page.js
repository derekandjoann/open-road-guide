// Server component: run the markers_overlay RPC + states up front and map the
// GeoJSON features into the light row shape the client expects, so the county
// index and state lens arrive as real HTML. Metadata lives here now too.
import { createClient } from '@supabase/supabase-js';
import MarkersClient from './MarkersClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TITLE = 'Historical Markers | Open Road Guide';
const DESC =
  'Every roadside historical marker across the American West, browsable by state and county — the plaques and monuments where the region remembers itself.';
const URL = 'https://openroadguide.com/markers';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default async function MarkersPage() {
  const [overlayRes, stateRes] = await Promise.all([
    supabase.rpc('markers_overlay'),
    supabase.from('states').select('slug, name').eq('published', true).order('sort_order', { ascending: true }),
  ]);

  // Same feature -> light-row mapping the client used to do in its useEffect.
  const features = overlayRes?.data?.features || [];
  const rows = features.map((f) => {
    const [lng, lat] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    return {
      id: p.id,
      name: p.name,
      longitude: lng,
      latitude: lat,
      state: p.state,
      county: p.county || 'Unknown',
      city: p.city,
      theme: p.theme,
      commemorates: p.commemorates,
      marker_type: p.marker_type,
      year: p.year,
      erected_by: p.erected_by,
      note: p.note,
      hmdb_url: p.hmdb_url,
      has_description: !!p.has_description,
      has_inscription: !!p.has_inscription,
    };
  });

  const present = new Set(rows.map((m) => m.state).filter(Boolean));
  const options = (stateRes.data || []).filter((s) => present.has(s.name));

  return <MarkersClient initialMarkers={rows} initialStateOptions={options} />;
}
