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
    this.vapidKey = 'BFRsOSpuWhq84mfFJ3zsfP3lvxmdUnu-E5SmFgYT1kG_jaBWKqmE1UG_B_kkMDtEja7xwTjJdnSLd_AeV_NU0ZU';
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
  async refreshTokenRegistration(userId, empresaId) {
    if (!this.isSupported || Notification.permission !== 'granted') {
      console.warn('[messaging.js] Refresh de token ignorado: notificações indisponíveis ou sem permissão.');
      return false;
    }
    if (!userId || !empresaId) {
      console.warn('[messaging.js] Refresh de token ignorado: usuário/empresa ausente.');
      return false;
    }

    try {
      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');

      if (!registration) {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }

      if (!registration.active) {
        await this.waitForServiceWorker(registration);
      }

      const token = await this.getMessagingToken(registration);

      if (!token) {
        return false;
      }

      const salvo = await this.sendTokenToServer(userId, empresaId);

      if (salvo) {
        console.log('[messaging.js] Token FCM do usuário renovado e salvo.');
      }

      return salvo;
    } catch (error) {
      console.error('[messaging.js] Erro ao renovar token FCM:', error);
      return false;
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

window.atualizarTokenNotificacoes = async function(userId, empresaId) {
  return window.messagingService.refreshTokenRegistration(userId, empresaId);
};

window.desativarNotificacoes = async function(userId) {
  if (!userId) {
    console.warn('[messaging.js] Não foi possível desativar: userId ausente.');
    return false;
  }

  try {
    await updateDoc(
      doc(db, "mensagensTokens", userId),
      {
        ativo: false,
        updatedAt: new Date()
      }
    );

    pararOuvinteDeNotificacoes();
    console.log('[messaging.js] Notificações desativadas no Pronti Pet.');
    return true;
  } catch (error) {
    console.error('[messaging.js] Erro ao desativar notificações:', error);
    return false;
  }
};
// ✅ CORREÇÃO CIRÚRGICA: aceita params opcionais (vitrine passa) e mantém fallback (painel)
window.solicitarPermissaoParaNotificacoes = async function(userIdParam = null, empresaIdParam = null) {
  unlockAudio();

  const btn = document.querySelector('.notification-button');

  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  try {
    const inicializado = await window.messagingService.initialize();

    if (!inicializado) {
      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Permita notificações no navegador para concluir a ativação.',
          'error'
        );
      }
      return false;
    }

    let userId = userIdParam;
    let empresaId = empresaIdParam;

    if (!userId || !empresaId) {
      const totalTentativas = 6;

      for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
        try {
          const sessionProfile = await verificarAcesso();

          if (
            sessionProfile &&
            sessionProfile.user &&
            sessionProfile.user.uid &&
            sessionProfile.empresaId
          ) {
            userId = sessionProfile.user.uid;
            empresaId = sessionProfile.empresaId;
            break;
          }
        } catch (erroAcesso) {
          console.warn(
            `[messaging.js] Tentativa ${tentativa}/${totalTentativas} para obter o perfil falhou:`,
            erroAcesso
          );
        }

        if (tentativa < totalTentativas) {
          await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
    }

    if (!userId || !empresaId) {
      console.error(
        '[messaging.js] Perfil inválido. Não foi possível identificar usuário e empresa para salvar o token.'
      );

      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Não foi possível identificar sua empresa. Tente ativar novamente.',
          'error'
        );
      }
      return false;
    }

    const tokenSalvo = await window.messagingService.sendTokenToServer(
      userId,
      empresaId
    );

    if (!tokenSalvo) {
      console.error(
        '[messaging.js] Token obtido, mas não foi salvo no Firestore.'
      );

      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Não foi possível concluir a ativação das notificações.',
          'error'
        );
      }
      return false;
    }

    if (btn) {
      btn.style.display = 'none';
    }

    if (window.mostrarMensagemNotificacao) {
      window.mostrarMensagemNotificacao(
        'Notificações ativas!',
        'success'
      );
    }

    iniciarOuvinteDeNotificacoes(userId);

    console.log('[messaging.js] Notificações configuradas com sucesso.', {
      userId,
      empresaId
    });

    return true;
  } catch (error) {
    console.error(
      '[messaging.js] Erro ao configurar notificações:',
      error
    );

    if (window.mostrarMensagemNotificacao) {
      window.mostrarMensagemNotificacao(
        'Erro ao ativar notificações. Tente novamente.',
        'error'
      );
    }

    return false;
  } finally {
    if (btn && btn.style.display !== 'none') {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
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
  let primeiraCarga = true;

  unsubscribeDeFila = onSnapshot(q, (snapshot) => {
    // O primeiro snapshot contém TODOS os documentos que já estavam pendentes
    // antes de o listener iniciar. Eles não são notificações novas e não devem
    // ser reapresentados ao usuário ao abrir/reabrir o aplicativo.
    if (primeiraCarga) {
      primeiraCarga = false;
      console.log(
        `[Ouvinte] Carga inicial concluída. ${snapshot.size} bilhete(s) pendente(s) antigo(s) ignorado(s).`
      );
      return;
    }

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
        console.log(`[Ouvinte] Bilhete ${bilheteId} recebido após a carga inicial.`);
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
