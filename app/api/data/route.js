import { supabase } from '../../../lib/supabase';
import { getMapData } from '../../../lib/mapData';

// One server-side data route for everything the interactive pages need.
//
// Endpoints are selected by the `kind` query parameter rather than by path
// segments. That is deliberate: it keeps this file at a plain folder path
// (app/api/data/) with no brackets or dots in the name, which iOS Smart
// Punctuation silently rewrites.
//
//   /api/data?kind=map                  → every overlay the /map page draws (old path; see /api/map-data)
//   /api/data?kind=nearme&lat=&lng=     → 8 nearest published POIs
//   /api/data?kind=search&q=            → POI search
//   /api/data?kind=marker&id=<uuid>     → one marker's long text
//   /api/data?kind=marker-county&state=&county= → light rows for one county
//   /api/data?kind=marker-search&q=&state=      → up to 60 markers by name/town/county
//   /api/data?kind=site-search&q=        → places, markers, drives, stories, regions, towns
//   /api/data?kind=near&lat=&lng=        → 12 nearest places and 12 nearest told markers
//
// The map's marker dots come from /api/marker-points (cached on the CDN).
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
      'Netlify-Vary': 'query=kind|q|id|lat|lng|state|county',
    },
  });

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') || '';

  // ---------------------------------------------------------------- map
  if (kind === 'map') {
    // Kept for old cached pages; /map now reads /api/map-data (CDN-cached).
    const d = await getMapData();
    return d ? json(d, 200) : json({ error: 'map data unavailable' }, 503);
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

  // ------------------------------------------------------- marker-county
  if (kind === 'marker-county') {
    const state = (searchParams.get('state') || '').trim().slice(0, 60);
    const county = (searchParams.get('county') || '').trim().slice(0, 80);
    if (!state || !county) return json({ error: 'state and county required' }, 400);

    const { data, error } = await supabase.rpc('markers_in_county', { p_state: state, p_county: county });
    if (error) return json({ error: 'lookup failed' }, 503);
    return json((data || []).map((m) => ({ ...m, state, county })), 200);
  }

  // ------------------------------------------------------- marker-search
  if (kind === 'marker-search') {
    const q = (searchParams.get('q') || '').trim().slice(0, 120);
    const state = (searchParams.get('state') || '').trim().slice(0, 60) || null;
    if (q.length < 2) return json([], 200);

    const { data, error } = await supabase.rpc('markers_search', { q, p_state: state, max_results: 60 });
    if (error) return json({ error: 'search failed' }, 503);
    return json(data || [], 200);
  }

  // -------------------------------------------------------- site-search
  if (kind === 'site-search') {
    const q = (searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return json({}, 200);
    const { data, error } = await supabase.rpc('site_search', { q });
    if (error) return json({ error: 'search failed' }, 503);
    return json(data || {}, 200);
  }

  // --------------------------------------------------------------- near
  if (kind === 'near') {
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const valid =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (!valid) return json({ error: 'bad coordinates' }, 400);
    const { data, error } = await supabase.rpc('near_point', { p_lat: lat, p_lng: lng });
    if (error) return json({ error: 'lookup failed' }, 503);
    return json(data || { places: [], markers: [] }, 200);
  }

  return json({ error: 'unknown kind' }, 404);
}
