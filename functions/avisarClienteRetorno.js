const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}

// Usa o mesmo banco nomeado do index.js
const db = getFirestore("pronti-app");
const fcm = admin.messaging();

const REGION = "southamerica-east1";

function montarMensagemRetorno({ nome, statusRetorno }) {
  const primeiroNome = String(nome || "Cliente").trim().split(" ")[0] || "Cliente";

  switch (statusRetorno) {
    case "atrasado":
      return `Oi, ${primeiroNome}! Já passou do período em que você costuma retornar. Quer agendar seu próximo horário?`;
    case "hoje":
      return `Oi, ${primeiroNome}! Hoje é um ótimo momento para seu retorno. Quer marcar seu próximo atendimento?`;
    case "em_breve":
      return `Oi, ${primeiroNome}! Seu período de retorno está chegando. Quer adiantar seu próximo agendamento?`;
    case "futuro":
      return `Oi, ${primeiroNome}! Estamos te avisando com antecedência para facilitar seu próximo agendamento. Quando quiser, é só marcar seu horário.`;
    default:
      return `Oi, ${primeiroNome}! Quer agendar seu próximo horário?`;
  }
}

async function buscarTokenDoCliente(clienteId) {
  if (!clienteId) return null;

  try {
    // Mesmo lugar usado no restante do sistema
    const tokenSnap = await db.collection("mensagensTokens").doc(clienteId).get();

    if (!tokenSnap.exists) return null;

    const dados = tokenSnap.data() || {};

    if (dados.ativo === false) return null;
    if (!dados.fcmToken || typeof dados.fcmToken !== "string") return null;

    return dados.fcmToken;
  } catch (error) {
    console.error(`Erro ao buscar token do cliente ${clienteId}:`, error);
    return null;
  }
}

const avisarClienteRetorno = onCall(
  { region: REGION },
  async (request) => {
    const data = request.data || {};
    const auth = request.auth;

    if (!auth) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const {
      empresaId,
      clienteId,
      clienteNome,
      statusRetorno,
      proximaDataIdeal = "",
      ultimoServicoNome = ""
    } = data;

    if (!empresaId || !clienteId) {
      throw new HttpsError(
        "invalid-argument",
        "empresaId e clienteId são obrigatórios."
      );
    }

    const mensagem = montarMensagemRetorno({
      nome: clienteNome,
      statusRetorno
    });

    const historicoRef = db
      .collection("empresarios")
      .doc(empresaId)
      .collection("historico_avisos_retorno")
      .doc();

    const token = await buscarTokenDoCliente(clienteId);

    let enviadoPush = false;
    let motivo = "";

    if (token) {
      try {
        await fcm.send({
          token,
          notification: {
            title: "Pronti • Aviso de retorno",
            body: mensagem
          },
          data: {
            tipo: "aviso_retorno",
            empresaId: String(empresaId),
            clienteId: String(clienteId),
            statusRetorno: String(statusRetorno || ""),
            proximaDataIdeal: String(proximaDataIdeal || ""),
            ultimoServicoNome: String(ultimoServicoNome || "")
          },
          android: {
            priority: "high",
            notification: {
              sound: "default",
              priority: "high"
            }
          },
          apns: {
            headers: {
              "apns-priority": "10"
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1
              }
            }
          },
          webpush: {
            headers: {
              Urgency: "high"
            }
          }
        });

        enviadoPush = true;
        motivo = "push_enviado";
      } catch (error) {
        console.error("Erro ao enviar push de retorno:", error);
        enviadoPush = false;
        motivo = error?.code || "erro_ao_enviar_push";
      }
    } else {
      motivo = "cliente_sem_token";
    }

    await historicoRef.set({
      empresaId,
      clienteId,
      clienteNome: clienteNome || "",
      statusRetorno: statusRetorno || "",
      proximaDataIdeal: proximaDataIdeal || "",
      ultimoServicoNome: ultimoServicoNome || "",
      mensagem,
      enviadoPush,
      motivo,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      criadoPor: auth.uid
    });

    return {
      ok: true,
      mensagem,
      enviadoPush,
      motivo
    };
  }
);

module.exports = { avisarClienteRetorno };
