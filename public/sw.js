// Open Road Guide service worker: offline trips for Drive Mode.
//
// It is registered only when someone opens Drive Mode (/drive), and it
// changes nothing while there is signal: every page and the trip data still
// come from the network first. It answers from the phone's saved copies only
// when the network fails:
//
//   page visits      network first; with no signal, the saved copy of that
//                    exact address, else a short "no signal" page that lists
//                    the trips saved on this phone
//   /_next/static/   the site's code and styles (their names change on every
//                    deploy, so a saved copy is never out of date); saved
//                    copy first, else the network
//   /api/course      a trip's road and stops; network first, saved copy when
//                    there is no signal
//
// Nothing is saved here on its own. Drive Mode's "Save for no signal" button
// (lib/offline.js) fills one cache per trip, named org-pack-<id>, and keeps
// the list of saved trips at /__offline/packs.json in the org-packs-index
// cache.
//
// To switch all of this off for every visitor, replace this file with one
// whose activate step calls self.registration.unregister().

const INDEX_CACHE = 'org-packs-index';
const INDEX_URL = '/__offline/packs.json';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      } catch {
        /* not supported */
      }
      await self.clients.claim();
    })()
  );
});

const saved = (request) => caches.match(request, { ignoreVary: true });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(saved(req).then((hit) => hit || fetch(req)));
    return;
  }
  if (url.pathname === '/api/course') {
    event.respondWith(
      fetch(req).catch(async () => (await saved(req)) || Response.json({ error: 'offline' }, { status: 503 }))
    );
  }
});

async function page(event) {
  try {
    const pre = await event.preloadResponse;
    if (pre) return pre;
    return await fetch(event.request);
  } catch {
    const hit = await saved(event.request.url);
    if (hit) return hit;
    return noSignalPage();
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function noSignalPage() {
  let packs = [];
  try {
    const r = await (await caches.open(INDEX_CACHE)).match(INDEX_URL);
    if (r) packs = await r.json();
  } catch {
    /* no list yet */
  }
  const items = packs.length
    ? packs
        .map((p) => `<a href="${esc(p.url)}"><b>${esc(p.title)}</b><span>${esc(p.pages)} pages saved</span></a>`)
        .join('')
    : '<p>No trips are saved on this phone yet. With signal, open a trip in Drive Mode and tap “Save for no signal”.</p>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>No signal | Open Road Guide</title><style>
body{margin:0;background:#12121f;color:#fff;font-family:Outfit,-apple-system,BlinkMacSystemFont,sans-serif;padding:1.5rem;max-width:760px;margin:0 auto}
.e{font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4ECDC4}
h1{font-family:Fraunces,Georgia,serif;font-size:2rem;margin:.3rem 0 .6rem}
p{color:rgba(255,255,255,.7);line-height:1.5}
a{display:flex;flex-direction:column;gap:.2rem;background:#1f1f33;border-left:6px solid #FF6B6B;border-radius:14px;padding:1rem 1.1rem;margin:.6rem 0;color:#fff;text-decoration:none}
a span{color:rgba(255,255,255,.62);font-size:.9rem}
</style></head><body><div class="e">Open Road Guide</div><h1>No signal</h1><p>This page isn’t saved on your phone. Your saved trips still work:</p>${items}</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
