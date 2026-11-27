import { supabase } from './supabase';
import { fetchAll } from './fetchAll';

// Everything the /map page draws except marker dots (those come from
// /api/marker-points): places, drives with their lines, regions with their
// outlines, stories, and which places belong to which region and story.
// Every list is read in pages: the database returns at most 1,000 rows per
// request, and places, region links and story links are past that.
// Returns null when places can't be read (nothing can be placed without them).
export async function getMapData() {
  const all = (build) =>
    fetchAll(build).then((data) => ({ data, error: null })).catch((error) => ({ data: [], error }));
  const [poiR, routeR, regionR, regionPoiR, storyR, storyPoiR] = await Promise.all([
    all((f, t) => supabase.from('pois').select('id,slug,name,latitude,longitude,category,tagline,thumbnail_url,thumbnail_public_id').eq('published', true).order('id').range(f, t)),
    all((f, t) => supabase.from('routes').select('slug,name,total_miles,short_description,path_geojson').eq('published', true).order('slug').range(f, t)),
    all((f, t) => supabase.from('regions').select('id,slug,name,short_description,bounds').eq('published', true).order('id').range(f, t)),
    all((f, t) => supabase.from('region_pois').select('region_id,poi_id').order('region_id').order('poi_id').range(f, t)),
    all((f, t) => supabase.from('stories').select('id,slug,title,story_type,excerpt').eq('published', true).order('id').range(f, t)),
    all((f, t) => supabase.from('story_pois').select('story_id,poi_id,sort_order').order('story_id').order('poi_id').range(f, t)),
  ]);
  if (poiR.error) return null;
  // One failed overlay never blanks the rest.
  return {
    pois: poiR.data || [],
    routes: routeR.error ? [] : routeR.data || [],
    regions: regionR.error ? [] : regionR.data || [],
    regionPois: regionPoiR.error ? [] : regionPoiR.data || [],
    stories: storyR.error ? [] : storyR.data || [],
    storyPois: storyPoiR.error ? [] : storyPoiR.data || [],
  };
}
