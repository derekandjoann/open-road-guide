import { getMapData } from '../../../lib/mapData';

// The /map page's data (places, drives, regions, stories) as one file at its
// own path with no query string, so Netlify's CDN can keep one copy for
// everyone: the database is read at most once an hour, and visitors get the
// file from the nearest CDN edge instead of waiting about 4 seconds.
export const revalidate = 3600;

export async function GET() {
  const d = await getMapData();
  if (!d) return Response.json({ error: 'map data unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(d, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=600',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
