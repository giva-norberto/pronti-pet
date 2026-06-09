// ============================ Imports principais ============================
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const cors = require("cors");

const {
  processarFila,
  ofertarVagaParaFila,
  confirmarOfertaFila,
  recusarOfertaFila,
} = require("./processarFila");

const { avisarClienteRetorno } = require("./avisarClienteRetorno");
const { rotinaRetornoClientes } = require("./rotinaRetornoClientes");
const { rotinaLembreteCliente } = require("./rotinaLembreteCliente");
const { rotinaResumoAgendamentosDono } = require("./rotinaResumoAgendamentosDono");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ========================= Inicialização do Firebase ======================
if (!admin.apps.length) {
  admin.initializeApp();
}

// Banco padrão do projeto atual: pronti-pet
const db = getFirestore();
const fcm = admin.messaging();

// =========================== Configurações gerais =============================

const REGION = "southamerica-east1";

const APP_URL = process.env.APP_URL || "https://pronti-pet.web.app";
const FUNCTION_BASE_URL =
  process.env.FUNCTION_BASE_URL ||
  "https://southamerica-east1-pronti-pet.cloudfunctions.net";

// =========================== Configuração de CORS =============================

const whitelist = [
  "https://pronti-pet.web.app",
  "https://pronti-pet.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origem não permitida por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const corsHandler = cors(corsOptions);

// ============================================================================
// ENDPOINT 1: verificarEmpresa
// ============================================================================
exports.verificarEmpresa = onRequest(
  { region: REGION, secrets: ["MERCADOPAGO_TOKEN"] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      if (req.method !== "POST") {
        logger.info("Método não permitido", { method: req.method });
        return res.status(405).json({
          error: "Método não permitido. Use POST.",
        });
      }

      try {
        const { empresaId } = req.body || {};

        if (!empresaId) {
          return res.status(400).json({
            error: "ID da empresa inválido ou não fornecido.",
          });
        }

        const empresaDocRef = db.collection("empresarios").doc(String(empresaId));
        const empresaDoc = await empresaDocRef.get();

        if (!empresaDoc.exists) {
          return res.status(404).json({
            error: "Empresa não encontrada.",
          });
        }

        const plano = empresaDoc.get("plano") || "free";
        const status = empresaDoc.get("status") || "";

        if (plano === "free" && status === "expirado") {
          return res.status(403).json({
            error: "Assinatura gratuita expirada. Por favor, selecione um plano.",
          });
        }

        let licencasNecessarias = 0;

        try {
          const profissionaisSnapshot = await empresaDocRef
            .collection("profissionais")
            .get();

          if (!profissionaisSnapshot.empty) {
            licencasNecessarias = profissionaisSnapshot.size;
          }
        } catch (profErr) {
          logger.warn("Erro ao buscar subcoleção profissionais, assumindo 0.", {
            error: profErr.message || profErr.toString(),
          });
        }

        logger.info("Empresa verificada com sucesso.", {
          empresaId,
          licencasNecessarias,
        });

        return res.status(200).json({
          licencasNecessarias,
        });
      } catch (error) {
        logger.error("Erro fatal em verificarEmpresa:", error);

        return res.status(500).json({
          error: "Erro interno do servidor.",
          detalhes: error.message || error.toString(),
        });
      }
    });
  }
);

// ============================================================================
// ENDPOINT 2: createPreference — Checkout Pro normal
// ============================================================================
exports.createPreference = onRequest(
  { region: REGION, secrets: ["MERCADOPAGO_TOKEN"] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      if (req.method !== "POST") {
        return res.status(405).json({
          error: "Método não permitido.",
        });
      }

      try {
        const token = process.env.MERCADOPAGO_TOKEN;

        if (!token) {
          logger.error("MERCADOPAGO_TOKEN não configurado.");
          return res.status(500).json({
            error: "Erro de configuração do servidor.",
          });
        }

        const { empresaId, planoSelecionado, precoPlanoSelecionado } =
          req.body || {};

        if (!empresaId || !planoSelecionado || !precoPlanoSelecionado) {
          return res.status(400).json({
            error: "Dados inválidos para criar pagamento.",
          });
        }

        const empresaRef = db.collection("empresarios").doc(String(empresaId));
        const empresaSnap = await empresaRef.get();

        if (!empresaSnap.exists) {
          return res.status(404).json({
            error: "Empresa não encontrada.",
          });
        }

        const empresaData = empresaSnap.data() || {};
        const donoId = empresaData.donoId || empresaId;

        let payerEmail = empresaData.emailDeNotificacao || null;

        if (!payerEmail && donoId) {
          try {
            const userRecord = await admin.auth().getUser(String(donoId));
            payerEmail = userRecord.email || null;
          } catch (authErr) {
            logger.warn("Não foi possível buscar email do dono.", {
              donoId,
              erro: authErr.message,
            });
          }
        }

        const valor = Number(precoPlanoSelecionado);

        if (!valor || valor <= 0) {
          return res.status(400).json({
            error: "Valor do plano inválido.",
          });
        }

        const preferenceData = {
          items: [
            {
              id: String(planoSelecionado),
              title: `Plano Pronti Pet - ${planoSelecionado} usuário(s)`,
              description: `Pagamento do plano Pronti Pet para empresa ${empresaId}`,
              quantity: 1,
              currency_id: "BRL",
              unit_price: valor,
            },
          ],
          payer: payerEmail
            ? {
                email: payerEmail,
              }
            : undefined,
          external_reference: String(empresaId),
          notification_url: `${FUNCTION_BASE_URL}/receberWebhookMercadoPago`,
          back_urls: {
            success: `${APP_URL}/index.html`,
            failure: `${APP_URL}/pagamento.html`,
            pending: `${APP_URL}/pagamento.html`,
          },
          auto_return: "approved",
          metadata: {
            empresaId: String(empresaId),
            planoSelecionado: String(planoSelecionado),
            valorPlanoSelecionado: valor,
          },
        };

        logger.info("Payload Mercado Pago Checkout Preference:", preferenceData);

        const mpResponse = await fetch(
          "https://api.mercadopago.com/checkout/preferences",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(preferenceData),
          }
        );

        const response = await mpResponse.json();

        if (!mpResponse.ok) {
          logger.error("Erro Mercado Pago checkout preference:", response);

          return res.status(500).json({
            error: "Erro ao criar pagamento no Mercado Pago.",
            detalhes:
              response?.message ||
              response?.error ||
              JSON.stringify(response),
          });
        }

        await empresaRef.set(
          {
            mercadoPagoPreferenceId: response.id,
            pagamentoPendente: true,
            statusAssinatura: "pendente",
            planoSolicitado: String(planoSelecionado),
            valorPlanoSolicitado: valor,
            ultimaCriacaoPagamentoMP:
              admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return res.status(200).json({
          id: response.id,
          init_point: response.init_point,
          sandbox_init_point: response.sandbox_init_point || null,
        });
      } catch (error) {
        logger.error("Erro em createPreference:", error);

        return res.status(500).json({
          error: "Erro ao criar pagamento no Mercado Pago.",
          detalhes: error.message || error.toString(),
        });
      }
    });
  }
);

// ============================================================================
// ENDPOINT 3: receberWebhookMercadoPago — Checkout Pro normal
// ============================================================================
exports.receberWebhookMercadoPago = onRequest(
  { region: REGION, secrets: ["MERCADOPAGO_TOKEN"] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      try {
        const body = req.body || {};
        const query = req.query || {};

        const type = body.type || query.type || query.topic || null;

        const paymentId =
          body?.data?.id ||
          body.id ||
          query["data.id"] ||
          query.id ||
          null;

        if (type !== "payment" || !paymentId) {
          return res.status(200).send("OK");
        }

        const token = process.env.MERCADOPAGO_TOKEN;

        if (!token) {
          logger.error("MERCADOPAGO_TOKEN não configurado no webhook.");
          return res.status(500).send("Erro de configuração interna.");
        }

        const mpResponse = await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
            String(paymentId)
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const payment = await mpResponse.json();

        if (!mpResponse.ok) {
          logger.error("Erro ao consultar payment Mercado Pago:", {
            status: mpResponse.status,
            resposta: payment,
          });

          return res.status(200).send("OK");
        }

        const empresaId =
          payment.external_reference ||
          payment.metadata?.empresaId ||
          payment.metadata?.empresa_id ||
          null;

        if (!empresaId) {
          logger.warn("Webhook MP payment sem external_reference", {
            mercadoPagoPaymentId: payment.id,
            statusMP: payment.status,
          });

          return res.status(200).send("OK");
        }

        const empresaRef = db.collection("empresarios").doc(String(empresaId));
        const empresaSnap = await empresaRef.get();

        if (!empresaSnap.exists) {
          logger.warn("Webhook MP: empresa não encontrada", {
            empresaId,
            mercadoPagoPaymentId: payment.id,
            statusMP: payment.status,
          });

          return res.status(200).send("OK");
        }

        const agora = admin.firestore.FieldValue.serverTimestamp();

        const updatesEmpresa = {
          mercadoPagoPaymentId: String(payment.id),
          mercadoPagoStatusPagamento: payment.status || null,
          ultimaAtualizacaoMP: agora,
          ultimaRespostaMercadoPago: payment.status || null,
        };

        if (payment.status === "approved") {
          const dataValidade = new Date();
          dataValidade.setDate(dataValidade.getDate() + 30);

          const novaValidade = admin.firestore.Timestamp.fromDate(dataValidade);

          updatesEmpresa.assinaturaAtiva = true;
          updatesEmpresa.assinaturaValidaAte = novaValidade;
          updatesEmpresa.proximoPagamento = novaValidade;
          updatesEmpresa.pagamentoPendente = false;
          updatesEmpresa.statusAssinatura = "ativa";
          updatesEmpresa.status = "ativo";
          updatesEmpresa.plano = "pago";
        } else if (
          payment.status === "pending" ||
          payment.status === "in_process"
        ) {
          updatesEmpresa.pagamentoPendente = true;
          updatesEmpresa.statusAssinatura = "pendente";
        } else {
          updatesEmpresa.pagamentoPendente = false;
          updatesEmpresa.statusAssinatura = payment.status || "recusado";
        }

        await empresaRef.set(updatesEmpresa, { merge: true });

        logger.info("Webhook MP payment processado com sucesso", {
          empresaId,
          mercadoPagoPaymentId: payment.id,
          statusMP: payment.status,
        });

        return res.status(200).send("OK");
      } catch (error) {
        logger.error("Erro ao processar webhook Mercado Pago:", error);
        return res.status(200).send("OK");
      }
    });
  }
);

// ============================================================================
// ROBÔ DO DONO — PUSH AUTOMÁTICO AO DONO NO MOMENTO DO AGENDAMENTO
// Mantido porque é o push que funciona com app fechado.
// ============================================================================
exports.notificarDonoInstantaneo = onDocumentCreated(
  {
    document: "empresarios/{empresaId}/agendamentos/{agendamentoId}",
    region: REGION,
  },
  async (event) => {
    const agendamento = event.data?.data();
    const empresaId = event.params?.empresaId;
    const agendamentoId = event.params?.agendamentoId;

    if (!agendamento || !empresaId) {
      logger.warn("Dados insuficientes para notificar dono", {
        agendamento,
        empresaId,
      });
      return;
    }

    try {
      const empresaDoc = await db.collection("empresarios").doc(empresaId).get();

      if (!empresaDoc.exists) {
        logger.warn(`Empresa ${empresaId} não encontrada`);
        return;
      }

      const empresaData = empresaDoc.data() || {};
      const donoId = empresaData.donoId || empresaData.userId || empresaId;

      const tokenDoc = await db.collection("mensagensTokens").doc(donoId).get();

      if (!tokenDoc.exists) {
        logger.warn(`Documento de token não encontrado para dono ${donoId}`);
        return;
      }

      const tokenData = tokenDoc.data() || {};
      const fcmToken = tokenData.fcmToken;

      if (!fcmToken) {
        logger.warn(`FCM Token vazio para dono ${donoId}`);
        return;
      }

      const nomeTutor =
        agendamento.clienteNome ||
        agendamento.tutorNome ||
        "Um tutor";

      const nomeServico =
        agendamento.servicoNome ||
        "um serviço";

      const horario =
        agendamento.horario ||
        agendamento.horarioTexto ||
        "horário indefinido";

      const notificationTitle = "📝 Novo Agendamento!";
      const notificationBody = `${nomeTutor} marcou ${nomeServico} às ${horario}`;

      const linkAgenda = `${APP_URL}/agenda.html`;

      const message = {
        token: fcmToken,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          tipo: "novo_agendamento",
          empresaId: String(empresaId),
          agendamentoId: String(agendamentoId || ""),
          link: linkAgenda,
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            priority: "high",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          fcmOptions: {
            link: linkAgenda,
          },
        },
      };

      await fcm.send(message);

      logger.info(`✅ Push enviado com sucesso ao dono ${donoId}`, {
        empresaId,
        agendamentoId,
      });
    } catch (error) {
      logger.error("❌ Erro ao notificar dono:", {
        erro: error.message || error.toString(),
      });
    }
  }
);

// ============================================================================
// rotinaProcessarFila
// Mantida no index apenas como agendador.
// A lógica principal fica em processarFila.js
// ============================================================================
exports.rotinaProcessarFila = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: "America/Sao_Paulo",
    region: REGION,
    memory: "256MiB",
  },
  async () => {
    try {
      await processarFila();
    } catch (error) {
      logger.error("❌ Erro fila:", error);
    }
  }
);

// ============================================================================
// Exportações de arquivos separados
// ============================================================================

exports.avisarClienteRetorno = avisarClienteRetorno;

exports.rotinaRetornoClientes = rotinaRetornoClientes;

exports.rotinaLembreteCliente = rotinaLembreteCliente;

exports.rotinaResumoAgendamentosDono = rotinaResumoAgendamentosDono;

exports.confirmarOfertaFila = confirmarOfertaFila;

exports.recusarOfertaFila = recusarOfertaFila;

exports.ofertarVagaParaFila = ofertarVagaParaFila;
