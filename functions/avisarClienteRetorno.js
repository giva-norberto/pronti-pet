const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const fcm = admin.messaging();

const REGION = "southamerica-east1";

function montarMensagemRetorno({ nome, statusRetorno }) {
  const primeiroNome = String(nome || "Tutor").trim().split(" ")[0] || "Tutor";

  switch (statusRetorno) {
    case "atrasado":
      return `Oi, ${primeiroNome}! Já passou do período em que seu pet costuma retornar. Quer agendar o próximo atendimento?`;
    case "hoje":
      return `Oi, ${primeiroNome}! Hoje é um ótimo momento para o retorno do seu pet. Quer marcar o próximo atendimento?`;
    case "em_breve":
      return `Oi, ${primeiroNome}! O período de retorno do seu pet está chegando. Quer adiantar o próximo agendamento?`;
    case "futuro":
      return `Oi, ${primeiroNome}! Estamos avisando com antecedência para facilitar o próximo atendimento do seu pet. Quando quiser, é só agendar.`;
    default:
      return `Oi, ${primeiroNome}! Quer agendar o próximo atendimento do seu pet?`;
  }
}

async function buscarTokenDoCliente(clienteId) {
  if (!clienteId) return null;

  try {
    const tokenSnap = await db.collection("mensagensTokens").doc(clienteId).get();

    if (!tokenSnap.exists) return null;

    const dados = tokenSnap.data() || {};

    if (dados.ativo === false) return null;
    if (!dados.fcmToken || typeof dados.fcmToken !== "string") return null;

    return dados.fcmToken;
  } catch (error) {
    console.error(`Erro ao buscar token do tutor ${clienteId}:`, error);
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
            title: "Pronti Pet • Aviso de retorno",
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
      motivo = "tutor_sem_token";
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
