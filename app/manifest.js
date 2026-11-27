// Web app manifest: lets phones install Open Road Guide to the home screen
// ("Add to Home Screen" on iPhone and iPad, "Install app" on Android and
// desktop Chrome). It opens full-screen, without the browser bar.
export default function manifest() {
  return {
    name: 'Open Road Guide',
    short_name: 'Open Road',
    description: 'Road trip guides, state by state: maps, scenic drives, and the roadside history worth pulling over for.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFF8F0',
    theme_color: '#1a1a2e',
    categories: ['travel', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Plan a trip', url: '/plan' },
      { name: 'Near me', url: '/near' },
      { name: 'The map', url: '/map' },
    ],
  };
}
