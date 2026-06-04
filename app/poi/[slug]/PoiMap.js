'use client';

// Client island for the POI detail page's map.
//
// MapLibre GL JS needs the browser (window, canvas, useEffect), so it can't
// render in a server component. This thin wrapper carries the 'use client'
// boundary: everything it imports — including MapView — is bundled and run on
// the client, regardless of whether MapView itself declares 'use client'.
//
// The parent server page passes a single plain POI object, which serializes
// cleanly across the server → client boundary.

import MapView from '../../../components/MapView';

export default function PoiMap({ poi }) {
  return (
    <MapView
      pois={[poi]}
      interactive={true}
      height="350px"
      compact={true}
    />
  );
}
