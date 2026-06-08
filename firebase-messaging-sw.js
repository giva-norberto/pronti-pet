// =====================================================================
// firebase-messaging-sw.js  (Firebase v10.x)
// PRONTI APP - Push Notifications + Cache Offline (PWA)
// ✅ UNIFICADO: Junta o antigo service-worker.js (cache) com o firebase-messaging-sw.js (push)
//    Agora é UM ÚNICO service worker que faz tudo.
// ======================================================================
// Firebase compat para Service Worker
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");
// --------------------------------------------------
// CONFIG FIREBASE (mesma do firebase-config.js)
// --------------------------------------------------
firebase.initializeApp({
  apiKey: "AIzaSyCkJt49sM3n_hIQOyEwzgOmzzdPlsF9PW4",
  authDomain: "pronti-app-37c6e.firebaseapp.com",
  projectId: "pronti-app-37c6e",
  storageBucket: "pronti-app-37c6e.firebasestorage.app",
  messagingSenderId: "736700619274",
  appId: "1:736700619274:web:557aa247905e56fa7e5df3"
});
// --------------------------------------------------
// MESSAGING
// --------------------------------------------------
const messaging = firebase.messaging();
// URLs padrão (fallback) — mantém comportamento antigo
const DEFAULT_VIEW_URL = "https://prontiapp.com.br/agendamentos";
const DEFAULT_FALLBACK_URL = "https://prontiapp.com.br/";
// --------------------------------------------------
// RECEBE PUSH COM APP FECHADO
// --------------------------------------------------
messaging.onBackgroundMessage(function (payload) {
  try {
    console.log("[Firebase SW] Push recebido:", payload);
    const data = payload?.data || {};
    const notification = payload?.notification || {};
    const title =
      notification.title ||
      data.title ||
      "Novo Agendamento";
    const options = {
      body:
        notification.body ||
        data.body ||
        "Você tem um novo agendamento!",
      icon: notification.icon || data.icon || "/icon.png",
      image: notification.image || data.image,
      badge: "/badge.png",
      tag: `agendamento-${data.bilheteId || data.lembreteId || Date.now()}`,
      requireInteraction: true,
      actions: [
        { action: "view", title: "Ver Agendamento" },
        { action: "dismiss", title: "Dispensar" }
      ],
      data: {
        ...data,
        link: data.link || data.url || ""
      }
    };
    self.registration.showNotification(title, options);
  } catch (err) {
    console.warn("[Firebase SW] Erro ao processar push em background:", err);
  }
});
// --------------------------------------------------
// CLICK NA NOTIFICAÇÃO
// --------------------------------------------------
self.addEventListener("notificationclick", function (event) {
  try {
    console.log("[Firebase SW] Clique na notificação:", event.action);
    const data = event.notification?.data || {};
    const linkFromPayload = (data && (data.link || data.url)) ? String(data.link || data.url) : "";
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
    console.warn("[Firebase SW] Erro no notificationclick:", err);
    event.waitUntil(clients.openWindow(DEFAULT_FALLBACK_URL));
  }
});
// ======================================================
// CACHE OFFLINE - PRONTI APP (antigo service-worker.js)
// ======================================================
const CACHE_NAME = "pronti-painel-v2";
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
// --------------------------------------------------
// INSTALL
// --------------------------------------------------
self.addEventListener("install", function (event) {
  console.log("[ServiceWorker] Install (unificado: push + cache)");
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("[ServiceWorker] Caching app shell");
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});
// --------------------------------------------------
// FETCH (cache offline)
// --------------------------------------------------
self.addEventListener("fetch", function (event) {
  const url = event.request.url;
  // NÃO interferir com Firebase / APIs externas
  if (
    url.includes("firebase") ||
    url.includes("googleapis") ||
    url.includes("firestore") ||
    url.includes("gstatic")
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request).then(function (fetchResponse) {
        // cacheia apenas GET do mesmo domínio
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
    }).catch(function () {
      // fallback se estiver offline
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
  console.log("[ServiceWorker] Activate (unificado: push + cache)");
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});
