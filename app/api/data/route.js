import { supabase } from '../../../lib/supabase';

// One server-side data route for everything the interactive pages need.
//
// Endpoints are selected by the `kind` query parameter rather than by path
// segments. That is deliberate: it keeps this file at a plain folder path
// (app/api/data/) with no brackets or dots in the name, which iOS Smart
// Punctuation silently rewrites.
//
//   /api/data?kind=map                  → every overlay the /map page draws
//   /api/data?kind=nearme&lat=&lng=     → 8 nearest published POIs
//   /api/data?kind=search&q=            → POI search
//   /api/data?kind=marker&id=<uuid>     → one marker's long text
//
// Nothing here accepts a table name, a column list, or a row limit from the
// caller. The shapes below are the only shapes this route can ever return.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Netlify's CDN keys its cache on the PATH ONLY — the query string is ignored
// unless Netlify-Vary names the parameters. Caching any response here would
// therefore serve one kind's payload for every other kind. Everything is
// no-store until that behaviour is verified in production; the map query is
// the same seven reads the browser used to make directly, so this is no
// heavier than the architecture it replaced.
const json = (body, status) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Netlify-Vary': 'query=kind|q|id|lat|lng',
    },
  });

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') || '';

  // ---------------------------------------------------------------- map
  if (kind === 'map') {
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
    if (poiR.error) return json({ error: 'map data unavailable' }, 503);

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
      200);
  }

  // ------------------------------------------------------------- nearme
  if (kind === 'nearme') {
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const valid =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    if (!valid) return json({ error: 'bad coordinates' }, 400);

    // Capped at 8 server-side so this can't be swept into a bulk export.
    const { data, error } = await supabase.rpc('nearme_pois', {
      user_lat: lat, user_lng: lng, max_results: 8,
    });
    if (error) return json({ error: 'lookup failed' }, 503);

    return json(data || [], 200);
  }

  // ------------------------------------------------------------- search
  if (kind === 'search') {
    const q = (searchParams.get('q') || '').trim().slice(0, 120);

    // The 3-character floor and 100-result cap are enforced here, not in the
    // browser, so neither can be bypassed by editing the request.
    if (q.length < 3) return json([], 200);

    const { data, error } = await supabase.rpc('search_pois', {
      search_query: q, max_results: 100,
    });
    if (error) return json({ error: 'search failed' }, 503);

    return json(data || [], 200);
  }

  // ------------------------------------------------------------- marker
  if (kind === 'marker') {
    const id = searchParams.get('id') || '';
    if (!UUID.test(id)) return json({ error: 'bad id' }, 400);

    // Single row only — there is no way to widen this into a table dump.
    const { data, error } = await supabase
      .from('markers')
      .select('description, inscription')
      .eq('id', id)
      .maybeSingle();
    if (error) return json({ error: 'lookup failed' }, 503);

    return json(
      { description: data?.description || '', inscription: data?.inscription || '' },
      200);
  }

  return json({ error: 'unknown kind' }, 404);
}
