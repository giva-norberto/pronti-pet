const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = getFirestore("pronti-app");
const fcm = admin.messaging();

exports.rotinaLembreteCliente = onSchedule(
  {
    schedule: "*/5 * * * *", // roda a cada 5 min
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
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

          const tokenDoc = await db
            .collection("mensagensTokens")
            .doc(lembrete.clienteId)
            .get();

          if (!tokenDoc.exists) {
            logger.warn(`Sem token cliente ${lembrete.clienteId}`);

            await ref.update({
              enviado: "sem_token",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });

            continue;
          }

          const tokenData = tokenDoc.data();
          const fcmToken = tokenData?.fcmToken;

          if (!tokenData?.ativo || !fcmToken) {
            logger.warn(`Token inválido ${lembrete.clienteId}`);

            await ref.update({
              enviado: "sem_token",
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });

            continue;
          }

          const link = `https://prontiapp.com.br/vitrine.html?empresa=${lembrete.empresaId}`;

          try {
            const messageId = await fcm.send({
              token: fcmToken,

              webpush: {
                notification: {
                  title: "⏰ Seu horário está chegando!",
                  body: `${lembrete.servicoNome} com ${lembrete.profissionalNome || "profissional"} às ${lembrete.horarioTexto}.\n\nVai conseguir ir?\nSe não, toque aqui e cancele para liberar o horário.`,
                  icon: "https://prontiapp.com.br/icon.png",
                  badge: "https://prontiapp.com.br/icon.png",
                  vibrate: [200, 100, 200],
                  requireInteraction: true,
                  tag: `lembrete-${lembrete.clienteId}-${lembrete.dataAgendamento}-${lembrete.horarioTexto}`,
                  renotify: true,
                },
                fcmOptions: { link },
              },

              android: {
                priority: "high",
                notification: {
                  sound: "default",
                  priority: "high",
                },
              },

              data: {
                tipo: "lembrete",
                link: link,
              },
            });

            await ref.update({
              enviado: true,
              processando: false,
              processadoEm: admin.firestore.FieldValue.serverTimestamp(),
              messageId,
            });

            logger.info(`✅ Enviado para ${lembrete.clienteId}`);
          } catch (err) {
            logger.error("Erro envio:", err);

            // NÃO apagar token!
            if (err.code === "messaging/registration-token-not-registered") {
              await db
                .collection("mensagensTokens")
                .doc(lembrete.clienteId)
                .set(
                  {
                    ativo: false,
                    ultimoErro: err.code,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
            }

            await ref.update({
              enviado: false,
              processando: false,
              ultimoErro: err.code || err.message,
            });
          }
        } catch (e) {
          logger.error("Erro interno:", e);

          await ref.update({
            processando: false,
            ultimoErro: e.message,
          });
        }
      }

      logger.info("Rotina concluída.");
    } catch (error) {
      logger.error("Erro geral:", error);
    }
  }
);
