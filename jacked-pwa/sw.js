// Bump CACHE whenever you ship a new build so clients re-fetch the shell.
// This byte alone is what makes an already-installed PWA even notice a new deploy (the
// browser only re-checks a service worker's own bytes, never its contents' behavior) --
// it went 74 releases unbumped before 2026-10-26 because nothing forced it to change, so
// index.html's resident-page update check (search RESIDENT-PAGE FIX) no longer depends on
// this value alone: it also polls index.html's own BUILD string directly.
const CACHE = 'jacked-v1.11.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting SW to activate immediately.
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isShell(req) {
  // Navigations and the core app files should always prefer fresh network
  // so code updates actually reach installed users.
  if (req.mode === 'navigate') return true;
  const url = new URL(req.url);
  return url.origin === self.location.origin &&
    /\/(index\.html|manifest\.json)?$/.test(url.pathname);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // API responses must NEVER be cached: the old catch-all cache-first branch
  // served a session's FIRST cloud read for every later read, so a second
  // backup in the same page-session merged against stale cloud state and
  // erased newer workouts (caught by network capture in harness testing —
  // this silently defeated v1.5's merge-safety on repeat backups, and the
  // poisoned entry persisted across days on resident pages).
  if (req.url.includes('supabase.co')) return; // network, no SW involvement

  // supabase-js CDN script: pinned to an exact version in index.html (no more floating
  // @2), so same-URL content never changes underneath a given deploy -- but cache-first
  // with no refresh path still means a device that fetched it once would never pick up a
  // later pin bump via this SW alone. Same stale-while-revalidate shape as the exercise DB
  // below: serve the cached copy instantly, refresh it in the background.
  if (req.url.includes('cdn.jsdelivr.net')) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(r => {
          if (r && r.status === 200) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return r;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Exercise DB + images: cache-first with background refresh (rarely changes,
  // big payloads, must work offline).
  if (req.url.includes('raw.githubusercontent.com')) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(r => {
          if (r && r.status === 200) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return r;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell: network-first, fall back to cache (offline).
  if (isShell(req)) {
    e.respondWith(
      fetch(req).then(r => {
        if (r && r.status === 200) {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (fonts, etc): cache-first.
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
