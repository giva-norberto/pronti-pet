const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = getFirestore("pronti-app");
const fcm = admin.messaging();

exports.rotinaResumoAgendamentosDono = onSchedule(
  {
    schedule: "0 * * * *", // roda de 1 em 1 hora
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    memory: "256MiB",
  },
  async () => {
    try {
      const agora = new Date();
      const janelaInicio = new Date(agora.getTime() - 70 * 60 * 1000);

      const snap = await db
        .collectionGroup("agendamentos")
        .where("criadoEm", ">=", admin.firestore.Timestamp.fromDate(janelaInicio))
        .limit(300)
        .get();

      if (snap.empty) {
        logger.info("Nenhum agendamento novo encontrado para resumo.");
        return;
      }

      const porEmpresa = new Map();

      snap.docs.forEach((docAg) => {
        const ag = docAg.data();

        if (ag.resumoDonoEnviado === true) return;
        if (ag.status && ag.status !== "ativo") return;
        if (!ag.empresaId) return;

        if (!porEmpresa.has(ag.empresaId)) {
          porEmpresa.set(ag.empresaId, []);
        }

        porEmpresa.get(ag.empresaId).push({
          id: docAg.id,
          ref: docAg.ref,
          data: ag,
        });
      });

      if (porEmpresa.size === 0) {
        logger.info("Nenhum agendamento pendente de resumo.");
        return;
      }

      for (const [empresaId, agendamentos] of porEmpresa.entries()) {
        try {
          const empresaSnap = await db.collection("empresarios").doc(empresaId).get();

          if (!empresaSnap.exists) {
            logger.warn(`Empresa não encontrada para resumo: ${empresaId}`);
            continue;
          }

          const empresa = empresaSnap.data() || {};
          const donoId = empresa.donoId || empresa.userId || empresaId;

          const tokenSnap = await db.collection("mensagensTokens").doc(donoId).get();

          if (!tokenSnap.exists) {
            logger.warn(`Token do dono não encontrado: ${donoId}`);
            continue;
          }

          const tokenData = tokenSnap.data() || {};
          const fcmToken = tokenData.fcmToken;

          if (!tokenData.ativo || !fcmToken) {
            logger.warn(`Token do dono inválido ou inativo: ${donoId}`);
            continue;
          }

          const quantidade = agendamentos.length;
          const nomeEmpresa = empresa.nomeFantasia || "seu negócio";

          const titulo = "📊 Novos agendamentos no Pronti";
          const mensagem =
            quantidade === 1
              ? `Você recebeu 1 novo agendamento na última hora em ${nomeEmpresa}.`
              : `Você recebeu ${quantidade} novos agendamentos na última hora em ${nomeEmpresa}.`;

          const link = "https://prontiapp.com.br/agenda.html";

          const messageId = await fcm.send({
            token: fcmToken,

            notification: {
              title: titulo,
              body: mensagem,
            },

            webpush: {
              notification: {
                title: titulo,
                body: mensagem,
                icon: "https://prontiapp.com.br/icon.png",
                badge: "https://prontiapp.com.br/icon.png",
                vibrate: [200, 100, 200],
                requireInteraction: true,
                tag: `resumo-agendamentos-${empresaId}`,
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
              tipo: "resumo_agendamentos",
              empresaId,
              quantidade: String(quantidade),
              link,
            },
          });

          const batch = db.batch();

          agendamentos.forEach((item) => {
            batch.set(
              item.ref,
              {
                resumoDonoEnviado: true,
                resumoDonoEnviadoEm: admin.firestore.FieldValue.serverTimestamp(),
                resumoDonoMessageId: messageId,
              },
              { merge: true }
            );
          });

          await batch.commit();

          logger.info(`✅ Resumo enviado para dono ${donoId}`, {
            empresaId,
            quantidade,
            messageId,
          });
        } catch (errEmpresa) {
          logger.error(`Erro ao processar resumo da empresa ${empresaId}:`, errEmpresa);
        }
      }

      logger.info("Rotina de resumo de agendamentos concluída.");
    } catch (error) {
      logger.error("Erro geral na rotina de resumo de agendamentos:", error);
    }
  }
);
