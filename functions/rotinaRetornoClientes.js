const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore("pronti-app");
const fcm = admin.messaging();

const REGION = "southamerica-east1";
const TIME_ZONE = "America/Sao_Paulo";

function montarMensagemRetorno({ nome, statusRetorno }) {
  const primeiroNome = String(nome || "Cliente").trim().split(" ")[0] || "Cliente";

  switch (statusRetorno) {
    case "hoje":
      return `Oi, ${primeiroNome}! Hoje é um ótimo momento para seu retorno. Quer marcar seu próximo atendimento?`;
    default:
      return `Oi, ${primeiroNome}! Quer agendar seu próximo horário?`;
  }
}

function normalizarDataISO(dataISO) {
  if (!dataISO || typeof dataISO !== "string") return null;
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

function adicionarDias(data, dias) {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

function diferencaEmDias(base, alvo) {
  const utcBase = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  const utcAlvo = Date.UTC(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.floor((utcAlvo - utcBase) / msPorDia);
}

function dataParaISO(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function classificarRetorno(proximaData, mediaDias) {
  if (!mediaDias || mediaDias <= 0 || !proximaData) {
    return "sem_historico";
  }

  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  const diff = diferencaEmDias(hoje, proximaData);

  if (diff < 0) return "atrasado";
  if (diff === 0) return "hoje";
  if (diff <= 7) return "em_breve";
  return "futuro";
}

function calcularMediaIntervalosComDetalhes(datasISO) {
  if (!Array.isArray(datasISO) || datasISO.length < 2) {
    return { mediaDias: 0, intervalosValidos: 0 };
  }

  const intervalos = [];

  for (let i = 1; i < datasISO.length; i++) {
    const dataAnterior = normalizarDataISO(datasISO[i - 1]);
    const dataAtual = normalizarDataISO(datasISO[i]);

    if (!dataAnterior || !dataAtual) continue;

    const intervalo = diferencaEmDias(dataAnterior, dataAtual);

    if (intervalo > 0) {
      intervalos.push(intervalo);
    }
  }

  if (!intervalos.length) {
    return { mediaDias: 0, intervalosValidos: 0 };
  }

  const soma = intervalos.reduce((total, valor) => total + valor, 0);

  return {
    mediaDias: Math.round(soma / intervalos.length),
    intervalosValidos: intervalos.length
  };
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
    console.error(`Erro ao buscar token do cliente ${clienteId}:`, error);
    return null;
  }
}

async function jaFoiAvisadoHoje(empresaId, clienteId, proximaDataIdeal) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const snapshot = await db
    .collection("empresarios")
    .doc(empresaId)
    .collection("historico_avisos_retorno")
    .where("clienteId", "==", clienteId)
    .where("proximaDataIdeal", "==", proximaDataIdeal)
    .where("criadoEm", ">=", admin.firestore.Timestamp.fromDate(hoje))
    .where("criadoEm", "<", admin.firestore.Timestamp.fromDate(amanha))
    .limit(1)
    .get();

  return !snapshot.empty;
}

async function enviarAvisoAutomatico({
  empresaId,
  clienteId,
  clienteNome,
  statusRetorno,
  proximaDataIdeal = "",
  ultimoServicoNome = ""
}) {
  const mensagem = montarMensagemRetorno({
    nome: clienteNome,
    statusRetorno
  });

  const historicoRef = db
    .collection("empresarios")
    .doc(empresaId)
    .collection("historico_avisos_retorno")
    .doc();

  const jaAvisado = await jaFoiAvisadoHoje(empresaId, clienteId, proximaDataIdeal);

  if (jaAvisado) {
    await historicoRef.set({
      empresaId,
      clienteId,
      clienteNome: clienteNome || "",
      statusRetorno: statusRetorno || "",
      proximaDataIdeal: proximaDataIdeal || "",
      ultimoServicoNome: ultimoServicoNome || "",
      mensagem,
      enviadoPush: false,
      motivo: "ja_avisado_hoje",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      criadoPor: "job"
    });

    return {
      ok: true,
      enviadoPush: false,
      motivo: "ja_avisado_hoje"
    };
  }

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
      console.error("Erro ao enviar push automático de retorno:", error);
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
    criadoPor: "job"
  });

  return {
    ok: true,
    enviadoPush,
    motivo
  };
}

async function calcularRetornosDaEmpresa(empresaId) {
  const snapshot = await db
    .collection("empresarios")
    .doc(empresaId)
    .collection("agendamentos")
    .where("status", "==", "realizado")
    .get();

  const agendamentos = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  const grupos = new Map();

  for (const ag of agendamentos) {
    const clienteId = ag.clienteId || "";
    const data = ag.data || "";

    if (!clienteId || !data) continue;

    if (!grupos.has(clienteId)) {
      grupos.set(clienteId, []);
    }

    grupos.get(clienteId).push(ag);
  }

  const calculados = [];

  for (const [clienteId, listaCliente] of grupos.entries()) {
    const ordenados = [...listaCliente].sort((a, b) => {
      return (a.data || "").localeCompare(b.data || "");
    });

    const ultimosCinco = ordenados.slice(-5);
    const datas = ultimosCinco.map((item) => item.data).filter(Boolean);

    const { mediaDias, intervalosValidos } = calcularMediaIntervalosComDetalhes(datas);

    const ultimoAtendimento = ultimosCinco[ultimosCinco.length - 1] || null;
    const dataUltima = ultimoAtendimento?.data
      ? normalizarDataISO(ultimoAtendimento.data)
      : null;

    const proximaData = dataUltima && mediaDias > 0
      ? adicionarDias(dataUltima, mediaDias)
      : null;

    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);

    const diasParaRetorno = proximaData
      ? diferencaEmDias(hoje, proximaData)
      : null;

    const statusRetorno = classificarRetorno(proximaData, mediaDias);

    calculados.push({
      clienteId,
      clienteNome: ultimoAtendimento?.clienteNome || "Cliente sem nome",
      ultimoServicoNome: ultimoAtendimento?.servicoNome || "Não informado",
      proximaDataIdeal: proximaData ? dataParaISO(proximaData) : "",
      mediaRetornoDias: mediaDias,
      diasParaRetorno,
      statusRetorno,
      quantidadeAtendimentosAnalisados: ultimosCinco.length,
      quantidadeIntervalosValidos: intervalosValidos
    });
  }

  return calculados;
}

const rotinaRetornoClientes = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: TIME_ZONE,
    region: REGION,
    memory: "256MiB",
  },
  async () => {
    console.log("JOB RETORNO CLIENTES INICIADO");

    const empresasSnap = await db.collection("empresarios").get();

    for (const empresaDoc of empresasSnap.docs) {
      const empresaId = empresaDoc.id;

      try {
        const retornos = await calcularRetornosDaEmpresa(empresaId);

        const clientesHoje = retornos.filter(
          (item) =>
            item.statusRetorno === "hoje" &&
            item.proximaDataIdeal &&
            item.quantidadeIntervalosValidos > 0
        );

        for (const item of clientesHoje) {
          try {
            const resultado = await enviarAvisoAutomatico({
              empresaId,
              clienteId: item.clienteId,
              clienteNome: item.clienteNome,
              statusRetorno: item.statusRetorno,
              proximaDataIdeal: item.proximaDataIdeal,
              ultimoServicoNome: item.ultimoServicoNome
            });

            console.log("RETORNO PROCESSADO", {
              empresaId,
              clienteId: item.clienteId,
              resultado
            });
          } catch (error) {
            console.error("Erro ao processar cliente no job", {
              empresaId,
              clienteId: item.clienteId,
              erro: error.message
            });
          }
        }
      } catch (error) {
        console.error("Erro ao processar empresa no job", {
          empresaId,
          erro: error.message
        });
      }
    }

    console.log("JOB RETORNO CLIENTES FINALIZADO");
  }
);

module.exports = { rotinaRetornoClientes };
