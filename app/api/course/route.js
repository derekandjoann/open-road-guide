import { parsePoints, routeLine, stopsAlong, resolveStops } from '../../../lib/course';

// Chart My Course data.
//
//   /api/course?pts=lng,lat;lng,lat;...   road line, miles, minutes, legs,
//                                         and the places and told markers along it
//   /api/course?resolve=p:slug,m:slug     the stops named in a shared trip link
//
// Answers are the same for everyone, so Netlify's CDN keeps them for a week,
// keyed on the query (Netlify-Vary). That also keeps the free routing server's
// one-request-a-second rule easy to honour.
export const dynamic = 'force-dynamic';

const reply = (body, status, cache) =>
  Response.json(body, {
    status,
    headers: cache
      ? {
          'Cache-Control': 'public, max-age=3600',
          'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
          'Netlify-Vary': 'query=pts|resolve',
        }
      : { 'Cache-Control': 'no-store' },
  });

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.has('resolve')) {
    try {
      const stops = await resolveStops(searchParams.get('resolve'));
      return reply({ stops }, 200, true);
    } catch {
      return reply({ error: 'lookup failed' }, 503, false);
    }
  }

  const pts = parsePoints(searchParams.get('pts'));
  if (!pts) return reply({ error: 'Give a start and an end (at most 23 stops between).' }, 400, false);

  let route;
  try {
    route = await routeLine(pts);
  } catch (e) {
    if (e.noRoute) return reply({ error: 'No drivable road joins those points.' }, 422, true);
    return reply({ error: 'The road line could not be loaded. Please try again in a moment.' }, 503, false);
  }

  let along = { places: [], markers: [] };
  try {
    along = await stopsAlong(route.line, route.miles);
  } catch {
    // The drive still shows without the list; the visitor can try again.
  }

  return reply(
    {
      miles: Math.round(route.miles),
      minutes: Math.round(route.minutes),
      legs: route.legs.map((l) => ({ miles: Math.round(l.miles * 10) / 10, minutes: Math.round(l.minutes) })),
      line: route.line,
      places: along.places,
      markers: along.markers,
    },
    200,
    true
  );
}
