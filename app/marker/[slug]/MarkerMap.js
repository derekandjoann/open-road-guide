'use client';

// Client island for the marker detail page's map — the same pattern as the
// POI page's PoiMap. MapLibre GL JS needs the browser (window, canvas,
// useEffect), so this thin wrapper carries the 'use client' boundary.
//
// The pin uses the site's historical-marker violet rather than a POI
// category color, matching how markers render everywhere else on the site.

import MapView from '../../../components/MapView';

export default function MarkerMap({ marker }) {
  return (
    <MapView
      pois={[marker]}
      markerColor="#9D4EDD"
      interactive={true}
      height="350px"
      compact={true}
    />
  );
}
