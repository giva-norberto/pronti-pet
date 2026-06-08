// ======================================================
// CACHE OFFLINE - PRONTI APP
// ======================================================

const CACHE_NAME = "pronti-painel-v4";

const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/menu-principal.css",
  "/menu-lateral.html",
  "/menu-lateral.js",
  "/dashboard.html",
  "/perfil.html"
];

// -------------------------------
// INSTALL
// -------------------------------
self.addEventListener("install", event => {
  console.log("[ServiceWorker] Install");

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[ServiceWorker] Caching app shell");
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

// -------------------------------
// FETCH
// -------------------------------
self.addEventListener("fetch", event => {
  const url = event.request.url;

  if (
    url.includes("firebase") ||
    url.includes("googleapis") ||
    url.includes("firestore") ||
    url.includes("gstatic")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(fetchResponse => {
        if (
          event.request.method === "GET" &&
          fetchResponse &&
          fetchResponse.ok &&
          fetchResponse.type === "basic"
        ) {
          const responseClone = fetchResponse.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }

        return fetchResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(response => {
          if (response) return response;

          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
      })
  );
});

// -------------------------------
// ACTIVATE
// -------------------------------
self.addEventListener("activate", event => {
  console.log("[ServiceWorker] Activate");

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// ======================================================
// PUSH NOTIFICATION - PRONTI APP
// ======================================================
self.addEventListener("push", event => {
  console.log("[ServiceWorker] Push recebido:", event);

  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    console.warn("[ServiceWorker] Push sem JSON válido:", e);
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || "Pronti";

  const link =
    data.link ||
    payload?.webpush?.fcmOptions?.link ||
    payload?.fcmOptions?.link ||
    "https://prontiapp.com.br";

  const tagNotificacao =
    data.tipo === "fila_oferta" && data.filaId
      ? `fila-oferta-${data.filaId}`
      : data.tipo && data.clienteId
        ? `${data.tipo}-${data.clienteId}`
        : data.tipo
          ? `pronti-${data.tipo}`
          : "pronti-geral";

  const options = {
    body: notification.body || data.body || "Você tem uma nova notificação.",
    icon: notification.icon || data.icon || "/icon.png",
    badge: notification.badge || data.badge || "/icon.png",
    vibrate: [200, 100, 200],
    requireInteraction: true,

    // Evita empilhar notificações iguais da mesma fila
    tag: tagNotificacao,
    renotify: true,

    data: {
      tipo: data.tipo || null,
      filaId: data.filaId || null,
      empresaId: data.empresaId || null,
      profissionalId: data.profissionalId || null,
      dataOferta: data.dataOferta || null,
      horarioOferta: data.horarioOferta || null,
      link
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ======================================================
// CLIQUE NA NOTIFICAÇÃO
// ======================================================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const link = event.notification?.data?.link || "https://prontiapp.com.br";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === link && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});
