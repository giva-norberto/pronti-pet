// ======================================================================
// firebase-messaging-sw.js
// PRONTI PET - Push Notifications + Cache Offline (PWA)
// ======================================================================

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

// --------------------------------------------------
// CONFIG FIREBASE - PRONTI PET
// --------------------------------------------------
firebase.initializeApp({
  apiKey: "AIzaSyDxbb2_onT2gbQahqogcddCOjNTWbwjb0k",
  authDomain: "pronti-pet.firebaseapp.com",
  projectId: "pronti-pet",
  storageBucket: "pronti-pet.firebasestorage.app",
  messagingSenderId: "970443692765",
  appId: "1:970443692765:web:21b8e61ff165f36e46d934"
});

// --------------------------------------------------
// MESSAGING
// --------------------------------------------------
const messaging = firebase.messaging();

// URLs padrão do Pronti Pet
const DEFAULT_VIEW_URL = "/agenda.html";
const DEFAULT_FALLBACK_URL = "/";

// --------------------------------------------------
// RECEBE PUSH COM APP FECHADO
// --------------------------------------------------
messaging.onBackgroundMessage(function (payload) {
  try {
    console.log("[Pronti Pet SW] Push recebido:", payload);

    const data = payload?.data || {};
    const notification = payload?.notification || {};

    const title =
      notification.title ||
      data.title ||
      "Novo agendamento pet";

    const options = {
      body:
        notification.body ||
        data.body ||
        "Você tem um novo agendamento no Pronti Pet!",
      icon: notification.icon || data.icon || "/icon.png",
      image: notification.image || data.image,
      badge: "/badge.png",
      tag: `agendamento-${data.bilheteId || data.lembreteId || Date.now()}`,
      requireInteraction: true,
      actions: [
        { action: "view", title: "Ver agenda" },
        { action: "dismiss", title: "Dispensar" }
      ],
      data: {
        ...data,
        link: data.link || data.url || ""
      }
    };

    self.registration.showNotification(title, options);

  } catch (err) {
    console.warn("[Pronti Pet SW] Erro ao processar push em background:", err);
  }
});

// --------------------------------------------------
// CLICK NA NOTIFICAÇÃO
// --------------------------------------------------
self.addEventListener("notificationclick", function (event) {
  try {
    console.log("[Pronti Pet SW] Clique na notificação:", event.action);

    const data = event.notification?.data || {};
    const linkFromPayload =
      data && (data.link || data.url)
        ? String(data.link || data.url)
        : "";

    event.notification.close();

    if (event.action === "dismiss") return;

    let targetUrl = DEFAULT_FALLBACK_URL;

    if (event.action === "view") {
      targetUrl = DEFAULT_VIEW_URL;
    }

    if (linkFromPayload) {
      targetUrl = linkFromPayload;
    }

    event.waitUntil(clients.openWindow(targetUrl));

  } catch (err) {
    console.warn("[Pronti Pet SW] Erro no notificationclick:", err);
    event.waitUntil(clients.openWindow(DEFAULT_FALLBACK_URL));
  }
});

// ======================================================
// CACHE OFFLINE - PRONTI PET
// ======================================================
const CACHE_NAME = "pronti-pet-painel-v1";

const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/menu-principal.css",
  "/menu-lateral.html",
  "/menu-lateral.js",
  "/dashboard.html",
  "/perfil.html",
  "/agenda.html",
  "/servicos.html",
  "/clientes.html"
];

// --------------------------------------------------
// INSTALL
// --------------------------------------------------
self.addEventListener("install", function (event) {
  console.log("[Pronti Pet SW] Install");

  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("[Pronti Pet SW] Cacheando app shell");
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

// --------------------------------------------------
// FETCH
// --------------------------------------------------
self.addEventListener("fetch", function (event) {
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
    caches.match(event.request)
      .then(function (response) {
        if (response) return response;

        return fetch(event.request).then(function (fetchResponse) {
          if (
            event.request.method === "GET" &&
            fetchResponse &&
            fetchResponse.type === "basic"
          ) {
            const responseClone = fetchResponse.clone();

            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }

          return fetchResponse;
        });
      })
      .catch(function () {
        if (event.request.destination === "document") {
          return caches.match("/index.html");
        }
      })
  );
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------
self.addEventListener("activate", function (event) {
  console.log("[Pronti Pet SW] Activate");

  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );

  self.clients.claim();
});
