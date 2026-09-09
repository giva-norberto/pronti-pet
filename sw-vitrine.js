const CACHE_NAME = 'pronti-pet-vitrine-v2';

const STATIC_ASSETS = [
  '/vitrine.html',
  '/vitrine.css',
  '/menu-principal.css',
  '/vitrine.js',
  '/vitrini-state.js',
  '/vitrini-profissionais.js',
  '/vitrini-agendamento.js',
  '/vitrini-auth.js',
  '/vitrini-ui.js',
  '/vitrine-pets.js',
  '/vitrine-atendimento.js',
  '/vitrine-assinatura-integration.js',
  '/vitrini-firebase.js',
  '/firebase-config.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined)
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('pronti-pet-vitrine-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }

    return response;
  } catch (error) {
    return (
      await caches.match(request) ||
      await caches.match(request, { ignoreSearch: true })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isStaticAsset = /\.(?:js|css|html)$/.test(url.pathname);

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(networkFirst(request));
});
