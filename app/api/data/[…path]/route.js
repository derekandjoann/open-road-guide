import { supabase } from '../../../../lib/supabase';

// One server-side data route for everything the interactive pages need.
//
// All four endpoints live in this single catch-all file on purpose: each one is
// a thin, fixed query, and keeping them together means one folder to create and
// one file to upload instead of four near-identical ones.
//
//   /api/data/map                     → every overlay the /map page draws
//   /api/data/nearme?lat=&lng=        → 8 nearest published POIs
//   /api/data/search?q=               → POI search
//   /api/data/marker/<uuid>           → one marker's long text
//
// Nothing here accepts a table name, a column list, or a row limit from the
// caller. The shapes below are the only shapes this route can ever return.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body, status, cache) =>
  Response.json(body, { status, headers: { 'Cache-Control': cache } });

export async function GET(request, { params }) {
  const { path } = await params;
  const segments = Array.isArray(path) ? path : [];
  const endpoint = segments[0] || '';
  const { searchParams } = new URL(request.url);

  // ---------------------------------------------------------------- map
  if (endpoint === 'map' && segments.length === 1) {
    const [poiR, routeR, regionR, regionPoiR, storyR, storyPoiR, markerR] = await Promise.all([
      supabase.from('pois').select('id,slug,name,latitude,longitude,category,tagline,thumbnail_url').eq('published', true),
      supabase.from('routes').select('slug,name,total_miles,short_description,path_geojson').eq('published', true),
      supabase.from('regions').select('id,slug,name,short_description,bounds').eq('published', true),
      supabase.from('region_pois').select('region_id,poi_id'),
      supabase.from('stories').select('id,slug,title,story_type,excerpt').eq('published', true),
      supabase.from('story_pois').select('story_id,poi_id,sort_order'),
      supabase.rpc('markers_overlay'),
    ]);

    // POIs are the spine — without them nothing else can be placed.
    if (poiR.error) return json({ error: 'map data unavailable' }, 503, 'no-store');

    // Same defensive contract as before: one failed overlay never blanks the rest.
    return json(
      {
        pois: poiR.data || [],
        routes: routeR.error ? [] : routeR.data || [],
        regions: regionR.error ? [] : regionR.data || [],
        regionPois: regionPoiR.error ? [] : regionPoiR.data || [],
        stories: storyR.error ? [] : storyR.data || [],
        storyPois: storyPoiR.error ? [] : storyPoiR.data || [],
        markers: markerR.error ? null : markerR.data || null,
      },
      200,
      'public, s-maxage=300, stale-while-revalidate=3600'
    );
  }

  // ------------------------------------------------------------- nearme
  if (endpoint === 'nearme' && segments.length === 1) {
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const valid =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    if (!valid) return json({ error: 'bad coordinates' }, 400, 'no-store');

    // Capped at 8 server-side so this can't be swept into a bulk export.
    const { data, error } = await supabase.rpc('nearme_pois', {
      user_lat: lat, user_lng: lng, max_results: 8,
    });
    if (error) return json({ error: 'lookup failed' }, 503, 'no-store');

    return json(data || [], 200, 'no-store');
  }

  // ------------------------------------------------------------- search
  if (endpoint === 'search' && segments.length === 1) {
    const q = (searchParams.get('q') || '').trim().slice(0, 120);

    // The 3-character floor and 100-result cap are enforced here, not in the
    // browser, so neither can be bypassed by editing the request.
    if (q.length < 3) return json([], 200, 'no-store');

    const { data, error } = await supabase.rpc('search_pois', {
      search_query: q, max_results: 100,
    });
    if (error) return json({ error: 'search failed' }, 503, 'no-store');

    return json(data || [], 200, 'public, s-maxage=60');
  }

  // ------------------------------------------------------------- marker
  if (endpoint === 'marker' && segments.length === 2) {
    const id = segments[1];
    if (!UUID.test(id)) return json({ error: 'bad id' }, 400, 'no-store');

    // Single row only — there is no way to widen this into a table dump.
    const { data, error } = await supabase
      .from('markers')
      .select('description, inscription')
      .eq('id', id)
      .maybeSingle();
    if (error) return json({ error: 'lookup failed' }, 503, 'no-store');

    return json(
      { description: data?.description || '', inscription: data?.inscription || '' },
      200,
      'public, s-maxage=3600'
    );
  }

  return json({ error: 'not found' }, 404, 'no-store');
}
