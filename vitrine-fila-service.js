import { db } from './vitrini-firebase.js';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getMessaging,
  getToken,
  isSupported
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";

export const FilaService = {
  isProcessing: false,

  /**
   * Gera a data local no formato YYYY-MM-DD.
   * Usa fuso do Brasil para evitar erro perto da meia-noite.
   */
  getDataLocalBR() {
    const agora = new Date();

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    return formatter.format(agora);
  },

  /**
   * Normaliza a lista de serviços para garantir estrutura consistente.
   */
  normalizarServicos(servicos = []) {
    return servicos.map((s) => ({
      id: s?.id || null,
      nome: s?.nome || "Serviço sem nome",
      duracao: Number(s?.duracao) || 0
    }));
  },

  /**
   * Soma a duração total dos serviços.
   */
  calcularDuracaoTotal(servicos = []) {
    return servicos.reduce((total, servico) => total + (Number(servico.duracao) || 0), 0);
  },

  /**
   * Busca token salvo no Firestore.
   */
  async buscarTokenSalvoDoUsuario(usuarioId) {
    if (!usuarioId) return null;

    try {
      const tokenRef = doc(db, "mensagensTokens", usuarioId);
      const tokenSnap = await getDoc(tokenRef);

      if (!tokenSnap.exists()) return null;

      const dados = tokenSnap.data() || {};
      if (!dados.ativo) return null;

      return dados.fcmToken || null;
    } catch (error) {
      console.error("❌ Erro ao buscar token salvo do usuário:", error.message);
      return null;
    }
  },

  /**
   * Salva token do usuário na coleção central de tokens.
   */
  async salvarTokenDoUsuario({ usuarioId, empresaId, token }) {
    if (!usuarioId || !token) return;

    try {
      const tokenRef = doc(db, "mensagensTokens", usuarioId);

      await setDoc(tokenRef, {
        ativo: true,
        empresaId: empresaId || null,
        fcmToken: token,
        navegador: typeof navigator !== "undefined" ? navigator.userAgent : null,
        tipo: "web",
        updatedAt: serverTimestamp(),
        userId: usuarioId
      }, { merge: true });

      try {
        localStorage.setItem("fcm_token", token);
      } catch (_) {}
    } catch (error) {
      console.error("❌ Erro ao salvar token do usuário:", error.message);
    }
  },

  /**
   * Tenta obter VAPID key de locais comuns sem quebrar o fluxo.
   */
  obterVapidKey() {
    try {
      return (
        window?.PRONTI_FIREBASE_VAPID_KEY ||
        window?.__FIREBASE_VAPID_KEY ||
        localStorage.getItem("firebase_vapid_key") ||
        localStorage.getItem("vapidKey") ||
        null
      );
    } catch (_) {
      return null;
    }
  },

  /**
   * Tenta gerar token web do Firebase Messaging.
   * Não quebra o fluxo se o navegador não suportar ou se o usuário negar permissão.
   */
  async gerarTokenWebSePossivel(usuarioId, empresaId) {
    try {
      const suporte = await isSupported();
      if (!suporte) return null;

      if (typeof window === "undefined" || typeof Notification === "undefined") {
        return null;
      }

      let permissao = Notification.permission;

      if (permissao === "default") {
        permissao = await Notification.requestPermission();
      }

      if (permissao !== "granted") {
        return null;
      }

      const vapidKey = this.obterVapidKey();
      if (!vapidKey) {
        console.warn("⚠️ VAPID key não encontrada para gerar token web.");
        return null;
      }

      const app = getApp();
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey });

      if (!token) return null;

      await this.salvarTokenDoUsuario({
        usuarioId,
        empresaId,
        token
      });

      return token;
    } catch (error) {
      console.error("❌ Erro ao gerar token web:", error.message);
      return null;
    }
  },

  /**
   * Garante o melhor token possível para o cliente:
   * 1. Firestore
   * 2. localStorage
   * 3. gera token novo se possível
   */
  async garantirTokenDoCliente(usuarioId, empresaId) {
    if (!usuarioId) return null;

    // 1) tenta token já salvo
    const tokenSalvo = await this.buscarTokenSalvoDoUsuario(usuarioId);
    if (tokenSalvo) return tokenSalvo;

    // 2) tenta localStorage
    let tokenLocal = null;
    try {
      tokenLocal = localStorage.getItem("fcm_token") || null;
    } catch (_) {
      tokenLocal = null;
    }

    if (tokenLocal) {
      await this.salvarTokenDoUsuario({
        usuarioId,
        empresaId,
        token: tokenLocal
      });
      return tokenLocal;
    }

    // 3) tenta gerar novo token web
    const tokenGerado = await this.gerarTokenWebSePossivel(usuarioId, empresaId);
    if (tokenGerado) return tokenGerado;

    return null;
  },

  /**
   * Expira filas antigas abertas do mesmo cliente/profissional/empresa.
   * Só bloqueia se houver uma fila aberta do dia atual.
   */
  async validarDuplicidadeOuExpirarAntigas({ filaRef, usuarioId, empresaId, profissionalId, hoje }) {
    const filaQuery = query(
      filaRef,
      where("clienteId", "==", usuarioId),
      where("empresaId", "==", empresaId),
      where("profissionalId", "==", profissionalId),
      where("status", "in", ["fila", "aguardando"]),
      limit(10)
    );

    const filaSnapshot = await getDocs(filaQuery);

    if (filaSnapshot.empty) {
      return { duplicado: false };
    }

    for (const item of filaSnapshot.docs) {
      const dados = item.data();
      const dataFila = dados?.dataFila || null;

      if (dataFila === hoje) {
        return {
          duplicado: true,
          id: item.id,
          mensagem: "Você já está na fila para esse profissional hoje."
        };
      }

      if (dataFila && dataFila !== hoje) {
        await updateDoc(doc(db, "fila_agendamentos", item.id), {
          status: "expirado",
          expiradoEm: serverTimestamp()
        });
      }

      if (!dataFila) {
        await updateDoc(doc(db, "fila_agendamentos", item.id), {
          status: "expirado",
          expiradoEm: serverTimestamp()
        });
      }
    }

    return { duplicado: false };
  },

  /**
   * Entra na fila de agendamento.
   */
  async entrarNaLista(state, usuario, preferencias = {}) {
    if (this.isProcessing) {
      return {
        sucesso: false,
        motivo: "processando",
        mensagem: "Já estamos processando sua solicitação."
      };
    }

    this.isProcessing = true;

    try {
      const profissional = state?.agendamento?.profissional;
      const servicosOriginais = state?.agendamento?.servicos || [];
      const empresaId = state?.empresaId || localStorage.getItem("empresaAtivaId");
      const hoje = this.getDataLocalBR();

      if (!usuario?.uid) {
        throw new Error("Usuário não autenticado.");
      }

      if (!empresaId) {
        throw new Error("empresaId não encontrado.");
      }

      if (!profissional?.id) {
        throw new Error("Dados do profissional incompletos no estado.");
      }

      if (!Array.isArray(servicosOriginais) || servicosOriginais.length === 0) {
        throw new Error("Nenhum serviço foi selecionado.");
      }

      const servicos = this.normalizarServicos(servicosOriginais);
      const duracaoTotal = this.calcularDuracaoTotal(servicos);

      if (duracaoTotal <= 0) {
        throw new Error("A duração total dos serviços é inválida.");
      }

      const filaRef = collection(db, "fila_agendamentos");

      const validacao = await this.validarDuplicidadeOuExpirarAntigas({
        filaRef,
        usuarioId: usuario.uid,
        empresaId,
        profissionalId: profissional.id,
        hoje
      });

      if (validacao.duplicado) {
        return {
          sucesso: false,
          motivo: "duplicado",
          mensagem: validacao.mensagem,
          id: validacao.id
        };
      }

      const tokenCliente = await this.garantirTokenDoCliente(usuario.uid, empresaId);

      const novoRegistro = {
        clienteId: usuario.uid,
        clienteNome: usuario.displayName || "Cliente",
        clienteEmail: usuario.email || null,
        fcmToken: tokenCliente || null,

        empresaId,

        profissionalId: profissional.id,
        profissionalNome: profissional.nome || "Profissional",

        servicos,
        duracaoTotal,

        preferencias: {
          turno: preferencias?.turno || "Qualquer horário"
        },

        status: "fila",
        origem: "vitrine",
        dataFila: hoje,

        criadoEm: serverTimestamp()
      };

      const docRef = await addDoc(filaRef, novoRegistro);

      console.log("✅ Sucesso! ID na fila:", docRef.id);

      if (!tokenCliente) {
        return {
          sucesso: true,
          id: docRef.id,
          mensagem: "Você entrou na fila, mas as notificações não estão ativas neste dispositivo. Para receber a oferta mais rápido, permita notificações no navegador."
        };
      }

      return {
        sucesso: true,
        id: docRef.id,
        mensagem: "Você entrou na fila com sucesso."
      };
    } catch (error) {
      console.error("❌ Erro no FilaService:", error.message);

      return {
        sucesso: false,
        motivo: "erro",
        mensagem: error.message || "Erro ao entrar na fila."
      };
    } finally {
      this.isProcessing = false;
    }
  }
};
