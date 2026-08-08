// ======================================================================
// messaging.js - Serviço de notificações Firebase
// ✅ Token FCM vinculado ao service worker correto
// ✅ Revalidação automática do token quando a permissão já existe
// ======================================================================
import { app, db, auth } from '/firebase-config.js';
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";
import { doc, setDoc, collection, addDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { verificarAcesso } from '/userService.js';

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

const messaging = getMessaging(app);
console.log('[DEBUG][messaging.js] Módulo carregado, usando instância central do Firebase.');

class MessagingService {
  constructor() {
    this.token = null;
    this.isSupported = 'serviceWorker' in navigator && 'Notification' in window;
    this.vapidKey = 'BFRsOSpuWhq84mfFJ3zsfP3lvxmdUnu-E5SmFgYT1kG_jaBWKqmE1UG_B_kkMDtEja7xwTjJdnSLd_AeV_NU0ZU';
    this.foregroundListenerConfigured = false;
  }

  async initialize({ solicitarPermissao = true } = {}) {
    if (!this.isSupported) {
      console.warn('[messaging.js] Notificações não suportadas neste navegador.');
      return false;
    }

    try {
      let permission = Notification.permission;

      if (permission === 'default' && solicitarPermissao) {
        permission = await Notification.requestPermission();
      }

      console.log('[DEBUG][messaging.js] Permissão de notificação:', permission);

      if (permission !== 'granted') {
        console.warn('[messaging.js] Permissão de notificações não concedida.');
        return false;
      }

      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!registration) {
        console.log('[messaging.js] Registrando firebase-messaging-sw.js...');
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }

      if (registration.active) {
        console.log('[DEBUG][messaging.js] firebase-messaging-sw.js já está ativo.');
      } else {
        console.log('[messaging.js] Aguardando ativação do firebase-messaging-sw.js...');
        await this.waitForServiceWorker(registration);
      }

      console.log('[DEBUG][messaging.js] Service Worker FCM pronto:', registration);

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
      }

      console.warn('[DEBUG][messaging.js] Não foi possível obter token FCM.');
      return null;
    } catch (error) {
      console.error('[messaging.js] Erro ao obter token FCM:', error);
      return null;
    }
  }

  setupForegroundMessageListener() {
    if (this.foregroundListenerConfigured) return;
    this.foregroundListenerConfigured = true;

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
        body,
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
      const ref = doc(db, 'mensagensTokens', userId);
      await setDoc(ref, {
        empresaId,
        userId,
        fcmToken: this.token,
        updatedAt: new Date(),
        ativo: true,
        tipo: 'web',
        navegador: navigator.userAgent || 'Não identificado'
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
      const alertsRef = collection(db, 'alerts');
      await addDoc(alertsRef, {
        empresaId,
        clienteNome,
        servico,
        horario,
        createdAt: new Date(),
        status: 'novo'
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

window.messagingService = new MessagingService();

async function obterIdentidadeParaToken(userIdParam = null, empresaIdParam = null) {
  let userId = userIdParam;
  let empresaId = empresaIdParam;

  if (userId && empresaId) return { userId, empresaId };

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
        return {
          userId: sessionProfile.user.uid,
          empresaId: sessionProfile.empresaId
        };
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

  return { userId: null, empresaId: null };
}

export async function sincronizarTokenAutorizado(userIdParam = null, empresaIdParam = null) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const inicializado = await window.messagingService.initialize({ solicitarPermissao: false });
    if (!inicializado) return false;

    const { userId, empresaId } = await obterIdentidadeParaToken(userIdParam, empresaIdParam);
    if (!userId || !empresaId) {
      console.warn('[messaging.js] Não foi possível identificar usuário/empresa para sincronizar o token.');
      return false;
    }

    const salvo = await window.messagingService.sendTokenToServer(userId, empresaId);
    if (salvo) {
      console.log('[messaging.js] Token FCM sincronizado automaticamente.', { userId, empresaId });
    }
    return salvo;
  } catch (error) {
    console.error('[messaging.js] Falha na sincronização automática do token:', error);
    return false;
  }
}

window.solicitarPermissaoParaNotificacoes = async function(userIdParam = null, empresaIdParam = null) {
  unlockAudio();

  const btn = document.querySelector('.notification-button');
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  try {
    const inicializado = await window.messagingService.initialize({ solicitarPermissao: true });

    if (!inicializado) {
      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Permita notificações no navegador para concluir a ativação.',
          'error'
        );
      }
      return false;
    }

    const { userId, empresaId } = await obterIdentidadeParaToken(userIdParam, empresaIdParam);

    if (!userId || !empresaId) {
      console.error('[messaging.js] Perfil inválido. Não foi possível identificar usuário e empresa para salvar o token.');
      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Não foi possível identificar sua empresa. Tente ativar novamente.',
          'error'
        );
      }
      return false;
    }

    const tokenSalvo = await window.messagingService.sendTokenToServer(userId, empresaId);
    if (!tokenSalvo) {
      console.error('[messaging.js] Token obtido, mas não foi salvo no Firestore.');
      if (window.mostrarMensagemNotificacao) {
        window.mostrarMensagemNotificacao(
          'Não foi possível concluir a ativação das notificações.',
          'error'
        );
      }
      return false;
    }

    if (btn) btn.style.display = 'none';

    if (window.mostrarMensagemNotificacao) {
      window.mostrarMensagemNotificacao('Notificações ativas!', 'success');
    }

    iniciarOuvinteDeNotificacoes(userId);

    console.log('[messaging.js] Notificações configuradas com sucesso.', {
      userId,
      empresaId
    });

    return true;
  } catch (error) {
    console.error('[messaging.js] Erro ao configurar notificações:', error);
    if (window.mostrarMensagemNotificacao) {
      window.mostrarMensagemNotificacao('Erro ao ativar notificações. Tente novamente.', 'error');
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
  if (unsubscribeDeFila) unsubscribeDeFila();

  if (!donoId) {
    console.warn('[Ouvinte] donoId não fornecido.');
    return;
  }

  const q = query(
    collection(db, 'filaDeNotificacoes'),
    where('donoId', '==', donoId),
    where('status', '==', 'pendente')
  );

  unsubscribeDeFila = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const bilhete = change.doc.data();
        const bilheteId = change.doc.id;
        console.log('✅ [Ouvinte] Novo bilhete recebido:', bilhete);

        if (window.messagingService) {
          const payload = {
            data: {
              title: bilhete.titulo,
              body: bilhete.mensagem
            }
          };
          window.messagingService.showForegroundNotification(payload);
          console.log('✅ [Ouvinte] Notificação local exibida com som.');
        }

        const clienteNome = bilhete.clienteNome || bilhete.nomeCliente || bilhete.template?.data?.nomeCliente || null;
        const servico = bilhete.servico || bilhete.servicoNome || bilhete.template?.data?.servicoNome || null;
        const horario = bilhete.horario || bilhete.horarioAgendamento || bilhete.template?.data?.horarioAgendamento || null;

        if (clienteNome && servico && horario) {
          fetch('https://script.google.com/macros/s/AKfycby_Va3ads-umFvz2PpKmSS4-yp1y7riOdsow06nY7pfIvQvZ2mwnnOloszlxuwgEn3L/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome: clienteNome,
              servico,
              horario
            })
          }).then(() => console.log('📧 E-mail disparado via Web App.'))
            .catch(err => console.error('❌ Erro ao disparar e-mail:', err));
        }

        console.log(`[Ouvinte] Bilhete ${bilheteId} será processado pela Cloud Function.`);
      }
    });
  }, (error) => {
    console.error('❌ Erro no listener da fila de notificações:', error);
  });

  console.log(`✅ Ouvinte iniciado para o dono: ${donoId}`);
}

export function pararOuvinteDeNotificacoes() {
  if (unsubscribeDeFila) {
    unsubscribeDeFila();
    unsubscribeDeFila = null;
    console.log('🛑 Ouvinte parado.');
  }
}

// ======================================================================
// INDEX MOBILE — legibilidade + recuperação automática de token
// ======================================================================
function ehIndexProntiPet() {
  const path = (window.location.pathname || '').toLowerCase();
  return path === '/' || path.endsWith('/index.html') || !!document.querySelector('.index-shell');
}

function aplicarFonteMaiorNoIndexMobile() {
  if (!ehIndexProntiPet() || document.getElementById('pronti-index-mobile-font-fix')) return;

  const style = document.createElement('style');
  style.id = 'pronti-index-mobile-font-fix';
  style.textContent = `
    @media (max-width: 680px) {
      .welcome-copy h1 { font-size: 1.12rem !important; }
      .owner-chip { font-size: .68rem !important; }
      .section-title-row h2 { font-size: 1rem !important; }
      .section-title-row a { font-size: .76rem !important; }
      .today-metric-value { font-size: 1.35rem !important; }
      .today-metric-label { font-size: .70rem !important; line-height: 1.25 !important; }
      .next-hour { font-size: .82rem !important; }
      .next-main strong { font-size: .86rem !important; }
      .next-main span { font-size: .72rem !important; }
      .next-status { font-size: .68rem !important; }
      .next-empty { font-size: .80rem !important; line-height: 1.4 !important; }
      .agenda-kicker { font-size: .70rem !important; }
      .agenda-feature-card p { font-size: .82rem !important; line-height: 1.45 !important; }
      .agenda-feature-button { font-size: .78rem !important; }
      .quick-section-header h2 { font-size: 1rem !important; }
      .menu-card span { font-size: .88rem !important; line-height: 1.2 !important; }
      .notification-message { font-size: .78rem !important; }
    }
  `;
  document.head.appendChild(style);
}

async function sincronizarTokenNoIndexAoEntrar() {
  if (!ehIndexProntiPet()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Não chama verificarAcesso() novamente no primeiro carregamento.
  // Aguarda de forma independente o Firebase Auth restaurar o usuário e
  // reutiliza a empresa já definida pelo fluxo principal no localStorage.
  const MAX_TENTATIVAS = 10;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const userId = auth.currentUser?.uid || null;
    const empresaId = localStorage.getItem('empresaAtivaId');

    if (userId && empresaId) {
      await sincronizarTokenAutorizado(userId, empresaId);
      return;
    }

    if (tentativa < MAX_TENTATIVAS) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.warn('[messaging.js] Token não sincronizado no index: usuário/empresa ainda indisponíveis.');
}

function inicializarAjustesDoIndex() {
  aplicarFonteMaiorNoIndexMobile();
  setTimeout(() => {
    sincronizarTokenNoIndexAoEntrar().catch((error) => {
      console.warn('[messaging.js] Sincronização automática do token no index falhou:', error);
    });
  }, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarAjustesDoIndex, { once: true });
} else {
  inicializarAjustesDoIndex();
}