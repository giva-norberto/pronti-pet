const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

// Banco padrão do projeto Pronti Pet.
const db = getFirestore();
const fcm = admin.messaging();

const REGION = "southamerica-east1";
const TIME_ZONE = "America/Sao_Paulo";
const APP_URL = "https://pronti-pet.web.app";

exports.rotinaLembreteCliente = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: TIME_ZONE,
    region: REGION,
    memory: "256MiB",
  },
  async () => {
    const agora = admin.firestore.Timestamp.now();

    try {
      const snapshot = await db
        .collection("lembretesPendentes")
        .where("enviado", "==", false)
        .where("dataEnvio", "<=", agora)
        .limit(50)
        .get();

      if (snapshot.empty) {
        logger.info("Nenhum lembrete pendente encontrado.");
        return;
      }

      for (const docLembrete of snapshot.docs) {
        const ref = docLembrete.ref;
        const lembrete = docLembrete.data();

        try {
          if (!lembrete || lembrete.enviado !== false) continue;
          if (lembrete.processando === true) continue;

          await ref.update({
            processando: true,
            processandoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          const clienteId = String(lembrete.clienteId || "").trim();
          const clienteAuthUid = String(
            lembrete.clienteAuthUid || clienteId || ""
          ).trim();

          if (!clienteAuthUid) {
            await ref.update({
              enviado: "dados_incompletos",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              ultimoErro: "clienteAuthUid_ausente",
            });
            continue;
          }

          const tokenDoc = await db
            .collection("mensagensTokens")
            .doc(clienteAuthUid)
            .get();

          if (!tokenDoc.exists) {
            await ref.update({
              enviado: "sem_token",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
            continue;
          }

          const tokenData = tokenDoc.data() || {};
          const fcmToken = tokenData.fcmToken;

          if (tokenData.ativo === false || !fcmToken) {
            await ref.update({
              enviado: "sem_token",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
            continue;
          }

          const empresaId = String(lembrete.empresaId || "").trim();

          if (!empresaId) {
            await ref.update({
              enviado: "dados_incompletos",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              ultimoErro: "empresaId_ausente",
            });
            continue;
          }

          const agendamentoId = String(
            lembrete.agendamentoId || ""
          ).trim();

          if (agendamentoId) {
            const agendamentoSnap = await db
              .collection("empresarios")
              .doc(empresaId)
              .collection("agendamentos")
              .doc(agendamentoId)
              .get();

            if (!agendamentoSnap.exists) {
              await ref.update({
                enviado: "agendamento_inexistente",
                processando: false,
                processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });
              continue;
            }

            const agendamentoData = agendamentoSnap.data() || {};
            const statusAgendamento = String(
              agendamentoData.status || ""
            ).trim();

            if (statusAgendamento !== "ativo") {
              await ref.update({
                enviado: "cancelado",
                processando: false,
                processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });
              continue;
            }
          }

          const link =
            `${APP_URL}/vitrine.html?empresa=${encodeURIComponent(empresaId)}`;

          const servicoNome =
            String(lembrete.servicoNome || "Seu atendimento").trim();

          const profissionalNome =
            String(lembrete.profissionalNome || "profissional").trim();

          const horarioTexto =
            String(lembrete.horarioTexto || lembrete.horario || "").trim();

          const dataAgendamento =
            String(lembrete.dataAgendamento || lembrete.data || "").trim();

          try {
            const notificationTitle = "⏰ Seu horário está chegando!";
            const notificationBody =
              `${servicoNome} com ${profissionalNome}` +
              `${horarioTexto ? ` às ${horarioTexto}` : ""}. ` +
              "Vai conseguir ir? Se não, toque aqui e cancele para liberar o horário.";

            const messageId = await fcm.send({
              token: fcmToken,
              data: {
                tipo: "lembrete",
                empresaId,
                lembreteId: String(docLembrete.id),
                title: notificationTitle,
                body: notificationBody,
                icon: "/icon.png",
                link,
              },
              webpush: {
                headers: {
                  Urgency: "high",
                },
                fcmOptions: { link },
              },
            });

            await ref.update({
              enviado: true,
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              messageId,
            });

            logger.info(`✅ Lembrete enviado para ${clienteAuthUid}.`);
          } catch (err) {
            logger.error("Erro ao enviar lembrete:", err);

            if (err.code === "messaging/registration-token-not-registered") {
              await db
                .collection("mensagensTokens")
                .doc(clienteAuthUid)
                .set(
                  {
                    ativo: false,
                    ultimoErro: err.code,
                    updatedAt:
                      admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
            }

            await ref.update({
              enviado: false,
              processando: false,
              ultimoErro: err.code || err.message || "erro_envio_push",
            });
          }
        } catch (errorInterno) {
          logger.error("Erro interno ao processar lembrete:", errorInterno);

          await ref.update({
            processando: false,
            ultimoErro:
              errorInterno.message || "erro_interno_processamento",
          });
        }
      }

      logger.info("Rotina de lembrete do cliente concluída.");
    } catch (error) {
      logger.error("Erro geral na rotina de lembrete do cliente:", error);
    }
  }
);
