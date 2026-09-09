// ======================================================================
// firebase-messaging-sw.js
// PRONTI PET - Push Notifications + Atualização/Cache PWA
// ======================================================================

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDxbb2_onT2gbQahqogcddCOjNTWbwjb0k",
  authDomain: "pronti-pet.firebaseapp.com",
  projectId: "pronti-pet",
  storageBucket: "pronti-pet.firebasestorage.app",
  messagingSenderId: "970443692765",
  appId: "1:970443692765:web:21b8e61ff165f36e46d934"
});

const messaging = firebase.messaging();
const DEFAULT_VIEW_URL = "/agenda.html";
const DEFAULT_FALLBACK_URL = "/";

messaging.onBackgroundMessage(function (payload) {
  try {
    console.log("[Pronti Pet SW] Push recebido:", payload);

    const data = payload?.data || {};
    const notification = payload?.notification || {};

    const title = notification.title || data.title || "Novo agendamento pet";
    const options = {
      body: notification.body || data.body || "Você tem um novo agendamento no Pronti Pet!",
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

self.addEventListener("notificationclick", function (event) {
  try {
    const data = event.notification?.data || {};
    const linkFromPayload = data && (data.link || data.url)
      ? String(data.link || data.url)
      : "";

    event.notification.close();
    if (event.action === "dismiss") return;

    let targetUrl = DEFAULT_FALLBACK_URL;
    if (event.action === "view") targetUrl = DEFAULT_VIEW_URL;
    if (linkFromPayload) targetUrl = linkFromPayload;

    event.waitUntil(clients.openWindow(targetUrl));
  } catch (err) {
    console.warn("[Pronti Pet SW] Erro no notificationclick:", err);
    event.waitUntil(clients.openWindow(DEFAULT_FALLBACK_URL));
  }
});

// ======================================================
// CACHE / CONTROLE DE VERSÃO
// ======================================================
const parametros = new URL(self.location.href).searchParams;
const VERSAO = parametros.get("v") || "1.0.0";
const CACHE_NAME = `pronti-pet-${VERSAO}`;

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
  "/clientes.html",
  "/pwa-update.js",
  "/version.json"
];

self.addEventListener("install", function (event) {
  console.log(`[Pronti Pet SW] Install ${VERSAO}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then(async function (cache) {
      await Promise.allSettled(
        FILES_TO_CACHE.map((arquivo) =>
          cache.add(`${arquivo}?v=${encodeURIComponent(VERSAO)}`)
        )
      );
    })
  );

  // Não usa skipWaiting automático. A troca ocorre quando o usuário
  // toca em "Atualizar agora" no aviso de nova versão.
});

self.addEventListener("message", function (event) {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", function (event) {
  console.log(`[Pronti Pet SW] Activate ${VERSAO}`);

  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter((key) => key.startsWith("pronti-pet-"))
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

function ignorarRequestExterno(url) {
  return (
    url.origin !== self.location.origin ||
    url.href.includes("firebase") ||
    url.href.includes("googleapis") ||
    url.href.includes("firestore") ||
    url.href.includes("gstatic")
  );
}

async function buscarRedeAtualizarCache(request) {
  const resposta = await fetch(request, { cache: "no-store" });

  if (
    resposta &&
    resposta.ok &&
    request.method === "GET" &&
    new URL(request.url).origin === self.location.origin
  ) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, resposta.clone());
  }

  return resposta;
}

async function fallbackDocumento(request) {
  return (
    await caches.match(request) ||
    await caches.match(`/index.html?v=${encodeURIComponent(VERSAO)}`) ||
    await caches.match(`/index.html`)
  );
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (ignorarRequestExterno(url)) return;

  // Rede primeiro, sem cache HTTP. O Cache Storage fica apenas como
  // contingência offline. Isso evita servir JS/CSS antigos após deploy.
  if (request.mode === "navigate") {
    event.respondWith(
      buscarRedeAtualizarCache(request).catch(() => fallbackDocumento(request))
    );
    return;
  }

  event.respondWith(
    buscarRedeAtualizarCache(request).catch(() => caches.match(request))
  );
});
