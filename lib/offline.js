// Offline trips ("Save for no signal") for Drive Mode.
//
// A saved trip is one browser cache, org-pack-<id>, holding exact copies of:
// the Drive Mode page for that trip, its two /api/course answers (the road
// and the chosen stops), every place and marker page along the road, and the
// site code and styles those pages use. public/sw.js answers from these
// copies when the network fails. The list of saved trips lives at
// /__offline/packs.json in the org-packs-index cache, so the "no signal"
// page and Drive Mode can show it.
//
// Photos, the map and fonts come from other sites and are not saved; pages
// fall back to plain fonts and show without photos.

export const PACK_PREFIX = 'org-pack-';
const INDEX_CACHE = 'org-packs-index';
const INDEX_URL = '/__offline/packs.json';
const PARALLEL = 4;

export function offlineSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;
}

export async function registerOffline() {
  if (!offlineSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

// A short, stable id for a trip's address (its query string).
export function packId(search) {
  let h = 5381;
  for (let i = 0; i < search.length; i += 1) h = ((h << 5) + h + search.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function listPacks() {
  try {
    const r = await (await caches.open(INDEX_CACHE)).match(INDEX_URL);
    return r ? await r.json() : [];
  } catch {
    return [];
  }
}

async function writeIndex(list) {
  const c = await caches.open(INDEX_CACHE);
  await c.put(INDEX_URL, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
}

// Site code and styles named in a page (script tags, style links, and the
// chunk lists inside the page's own data).
function assetUrls(html) {
  const out = new Set();
  const re = /\/_next\/static\/[A-Za-z0-9_\-./~%]+?\.(?:js|css|woff2?)/g;
  let m;
  while ((m = re.exec(html))) out.add(m[0]);
  return out;
}

async function runAll(urls, worker) {
  let i = 0;
  const lanes = Array.from({ length: Math.min(PARALLEL, urls.length) }, async () => {
    while (i < urls.length) {
      const u = urls[i];
      i += 1;
      await worker(u);
    }
  });
  await Promise.all(lanes);
}

// Save (or refresh) one trip. pages: site paths of the stop pages.
// api: the exact /api/course addresses Drive Mode reads.
export async function savePack({ id, title, url, api, pages }, onProgress = () => {}) {
  const name = PACK_PREFIX + id;
  await caches.delete(name); // a refresh starts clean
  const cache = await caches.open(name);
  const main = [url, ...api, ...pages];
  const assets = new Set();
  let done = 0;
  let bytes = 0;
  let failed = 0;
  const total = main.length;

  const keep = async (u, scan) => {
    try {
      const res = await fetch(u, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.clone().arrayBuffer();
      bytes += body.byteLength;
      if (scan && /text\/html/.test(res.headers.get('content-type') || '')) {
        assetUrls(new TextDecoder().decode(body)).forEach((a) => assets.add(a));
      }
      await cache.put(u, res);
      return true;
    } catch {
      return false;
    }
  };

  await runAll(main, async (u) => {
    if (!(await keep(u, true))) failed += 1;
    done += 1;
    onProgress(done, total);
  });
  // The trip page itself must be saved, or the pack is no use.
  if (!(await cache.match(url, { ignoreVary: true }))) {
    await caches.delete(name);
    throw new Error('page');
  }
  await runAll([...assets], async (a) => {
    await keep(a, false);
  });

  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* the browser decides */
  }

  const entry = { id, title, url, pages: Math.max(0, pages.length - failed), failed, bytes, saved: Date.now() };
  const list = (await listPacks()).filter((p) => p.id !== id);
  await writeIndex([entry, ...list]);
  return entry;
}

export async function removePack(id) {
  await caches.delete(PACK_PREFIX + id);
  await writeIndex((await listPacks()).filter((p) => p.id !== id));
}

export const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
