// ======================================================================
// messaging.js - Serviço de notificações Firebase
// ✅ VERSÃO CORRIGIDA - Token FCM vinculado ao service worker correto
// ✅ AJUSTE: Usa SEMPRE a registration do firebase-messaging-sw.js para gerar o token
//    (corrige bug onde navigator.serviceWorker.ready retornava o SW do PWA)
// ======================================================================
import { app, db } from '/firebase-config.js';
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";
import { doc, setDoc, collection, addDoc, query, where, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { verificarAcesso } from '/userService.js';
// --- INÍCIO DA MELHORIA DE ÁUDIO ---
let audioUnlocked = false;
export function unlockAudio() {
  if (audioUnlocked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    audioUnlocked = true;
    console.log('[Audio] Contexto de áudio desbloqueado por interação do usuário.');
  } catch (error) {
    console.error('[Audio] Falha ao desbloquear áudio:', error);
  }
}
// --- FIM DA MELHORIA DE ÁUDIO ---
const messaging = getMessaging(app);
console.log('[DEBUG][messaging.js] Módulo carregado, usando instância central do Firebase.');
class MessagingService {
  constructor() {
    this.token = null;
    this.isSupported = 'serviceWorker' in navigator && 'Notification' in window;
    this.vapidKey = 'BAdbSkQO73zQ0hz3lOeyXjSSGO78NhJaLYYjKtzmfMxmnEL8u_7tvYkrQUYotGD5_qv0S5Bfkn3YI6E9ccGMB4w';
  }
  async initialize() {
    if (!this.isSupported) {
      console.warn('[messaging.js] Notificações não suportadas neste navegador.');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      console.log('[DEBUG][messaging.js] Permissão de notificação:', permission);
      if (permission !== 'granted') {
        console.warn('[messaging.js] Permissão negada pelo usuário.');
        return false;
      }
      // ✅ CORREÇÃO: Registrar e usar SEMPRE o firebase-messaging-sw.js
      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!registration) {
        console.log('[messaging.js] Registrando firebase-messaging-sw.js...');
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }
      // ✅ CORREÇÃO: Aguardar o firebase-messaging-sw.js ficar ativo
      //    (antes usava navigator.serviceWorker.ready que podia retornar o SW do PWA)
      if (registration.active) {
        console.log('[DEBUG][messaging.js] firebase-messaging-sw.js já está ativo.');
      } else {
        console.log('[messaging.js] Aguardando ativação do firebase-messaging-sw.js...');
        await this.waitForServiceWorker(registration);
      }
      console.log('[DEBUG][messaging.js] Service Worker FCM pronto:', registration);
      // ✅ CORREÇÃO: Passa a registration do firebase-messaging-sw.js (não activeReg)
      await this.getMessagingToken(registration);
      if (!this.token) {
        console.warn('[messaging.js] initialize: token não foi obtido (null).');
        return false;
      }
      this.setupForegroundMessageListener();
      console.log('[DEBUG][messaging.js] Serviço de Messaging inicializado com sucesso!');
      return true;
    } catch (error) {
      console.error('[messaging.js] Erro ao inicializar Messaging:', error);
      return false;
    }
  }
  async waitForServiceWorker(registration) {
    return new Promise((resolve) => {
      if (registration.active) return resolve();
      const worker = registration.installing || registration.waiting;
      if (worker) {
        const timeout = setTimeout(() => resolve(), 5000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timeout);
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
  async getMessagingToken(registration) {
    try {
      // Pequeno delay para garantir que o SW está pronto (necessário em mobile)
      await new Promise(r => setTimeout(r, 1000));
      const currentToken = await getToken(messaging, {
        vapidKey: this.vapidKey,
        serviceWorkerRegistration: registration
      });
      if (currentToken) {
        this.token = currentToken;
        localStorage.setItem('fcm_token', currentToken);
        console.log('[DEBUG][messaging.js] Token FCM obtido:', currentToken);
        return currentToken;
      } else {
        console.warn('[DEBUG][messaging.js] Não foi possível obter token FCM.');
        return null;
      }
    } catch (error) {
      console.error('[messaging.js] Erro ao obter token FCM:', error);
      return null;
    }
  }
  setupForegroundMessageListener() {
    onMessage(messaging, (payload) => {
      console.log('[messaging.js] Mensagem recebida em primeiro plano:', payload);
      this.showForegroundNotification(payload);
    });
  }
  showForegroundNotification(payload) {
    const title = payload.notification?.title || payload.data?.title || 'Nova Notificação';
    const body = payload.notification?.body || payload.data?.body || 'Você recebeu uma nova mensagem.';
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: payload.notification?.icon || payload.data?.icon || '/icon.png',
        badge: '/badge.png',
        tag: `notif-${Date.now()}`,
        renotify: true
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      try {
        if (audioUnlocked) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          const oscillator = ctx.createOscillator();
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(880, ctx.currentTime);
          oscillator.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.15);
        }
      } catch (err) {
        console.error('[Audio] Falha ao tocar som da notificação:', err);
      }
    }
  }
  async sendTokenToServer(userId, empresaId) {
    if (!this.token) {
      console.warn('[messaging.js] Token não disponível.');
      return false;
    }
    if (!userId || !empresaId) {
      console.error('[messaging.js] userId ou empresaId não fornecidos.');
      return false;
    }
    try {
      const ref = doc(db, "mensagensTokens", userId);
      await setDoc(ref, {
        empresaId: empresaId,
        userId: userId,
        fcmToken: this.token,
        updatedAt: new Date(),
        ativo: true,
        tipo: "web",
        navegador: navigator.userAgent || "Não identificado",
      }, { merge: true });
      console.log('[messaging.js] Token salvo/atualizado no Firestore.');
      return true;
    } catch (err) {
      console.error('[messaging.js] ERRO ao salvar token no Firestore:', err);
      return false;
    }
  }
  async saveAlert(empresaId, clienteNome, servico, horario) {
    try {
      const alertsRef = collection(db, "alerts");
      await addDoc(alertsRef, {
        empresaId,
        clienteNome,
        servico,
        horario,
        createdAt: new Date(),
        status: "novo"
      });
      console.log('[messaging.js] Alerta salvo no Firestore.');
      return true;
    } catch (err) {
      console.error('[messaging.js] Erro ao salvar alerta no Firestore:', err);
      return false;
    }
  }
  getCurrentToken() {
    return this.token || localStorage.getItem('fcm_token');
  }
}
// --- INSTÂNCIA GLOBAL ---
window.messagingService = new MessagingService();
// ✅ CORREÇÃO CIRÚRGICA: aceita params opcionais (vitrine passa) e mantém fallback (painel)
window.solicitarPermissaoParaNotificacoes = async function(userIdParam = null, empresaIdParam = null) {
  unlockAudio();
  const ok = await window.messagingService.initialize();
  if (ok) {
    try {
      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao('Notificações ativas!', 'success');
        const btn = document.querySelector('.notification-button');
        if (btn) btn.style.display = 'none';
      }
      // 1) tenta usar parâmetros (ideal para vitrine/agendamento)
      let userId = userIdParam;
      let empresaId = empresaIdParam;
      // 2) fallback antigo (painel): usa verificarAcesso()
      if (!userId || !empresaId) {
        const sessionProfile = await verificarAcesso();
        if (!sessionProfile || !sessionProfile.user || !sessionProfile.empresaId) {
          console.error('[messaging.js] Perfil inválido. Não foi possível salvar o token.');
          return;
        }
        userId = sessionProfile.user.uid;
        empresaId = sessionProfile.empresaId;
      }
      await window.messagingService.sendTokenToServer(userId, empresaId);
      iniciarOuvinteDeNotificacoes(userId);
    } catch (e) {
      console.error('[messaging.js] Erro ao configurar notificações:', e);
    }
  } else {
    if (window.mostrarMensagemNotificacao) {
      window.mostrarMensagemNotificacao('Permita notificações no navegador.', 'error');
    }
  }
};
let unsubscribeDeFila = null;
export function iniciarOuvinteDeNotificacoes(donoId) {
  if (unsubscribeDeFila) {
    unsubscribeDeFila();
  }
  if (!donoId) {
    console.warn('[Ouvinte] donoId não fornecido.');
    return;
  }
  const q = query(
    collection(db, "filaDeNotificacoes"),
    where("donoId", "==", donoId),
    where("status", "==", "pendente")
  );
  unsubscribeDeFila = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const bilhete = change.doc.data();
        const bilheteId = change.doc.id;
        console.log("✅ [Ouvinte] Novo bilhete recebido:", bilhete);
        if (window.messagingService) {
          const payload = {
            data: {
              title: bilhete.titulo,
              body: bilhete.mensagem
            }
          };
          window.messagingService.showForegroundNotification(payload);
          console.log("✅ [Ouvinte] Notificação local exibida com som.");
        }
        const clienteNome = bilhete.clienteNome || bilhete.nomeCliente || bilhete.template?.data?.nomeCliente || null;
        const servico = bilhete.servico || bilhete.servicoNome || bilhete.template?.data?.servicoNome || null;
        const horario = bilhete.horario || bilhete.horarioAgendamento || bilhete.template?.data?.horarioAgendamento || null;
        if (clienteNome && servico && horario) {
          fetch("https://script.google.com/macros/s/AKfycby_Va3ads-umFvz2PpKmSS4-yp1y7riOdsow06nY7pfIvQvZ2mwnnOloszlxuwgEn3L/exec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nome: clienteNome,
              servico: servico,
              horario: horario
            })
          }).then(() => console.log("📧 E-mail disparado via Web App."))
            .catch(err => console.error("❌ Erro ao disparar e-mail:", err));
        }
        // Importante: Mantivemos o log de correção para a Cloud Function
        console.log(`[Ouvinte] Bilhete ${bilheteId} será processado pela Cloud Function.`);
      }
    });
  }, (error) => {
    console.error("❌ Erro no listener da fila de notificações:", error);
  });
  console.log(`✅ Ouvinte iniciado para o dono: ${donoId}`);
}
export function pararOuvinteDeNotificacoes() {
  if (unsubscribeDeFila) {
    unsubscribeDeFila();
    unsubscribeDeFila = null;
    console.log("🛑 Ouvinte parado.");
  }
}
