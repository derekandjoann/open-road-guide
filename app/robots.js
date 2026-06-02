const BASE = 'https://openroadguide.com';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
