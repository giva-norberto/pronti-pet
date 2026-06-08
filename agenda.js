/**
 * agenda.js - Pronti (versão completa e revisada, Firebase 10.13.2)
 * - Três modos: Dia, Semana, Histórico.
 * - Considera expediente dos profissionais para fechamento e filtro.
 * - Modal "Ausência" (Não Compareceu) só aparece após expediente do dia.
 * - Só pergunta sobre ausência se o dia tinha expediente ativo de ao menos 1 profissional.
 * - Filtro DIA já pula para o próximo expediente se o dia atual acabou.
 * - Multi-empresa, profissional, e lógica completa de fechamento.
 */

import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ----------- MULTI-EMPRESA: Checa empresa ativa -----------
let empresaId = localStorage.getItem("empresaAtivaId");
if (!empresaId) {
  window.location.href = "selecionar-empresa.html";
  throw new Error("Nenhuma empresa ativa encontrada.");
}

// DOM Elements
const listaAgendamentosDiv = document.getElementById("lista-agendamentos");
const filtroProfissionalEl = document.getElementById("filtro-profissional");
const btnAgendaDia = document.getElementById("btn-agenda-dia");
const btnAgendaSemana = document.getElementById("btn-agenda-semana");
const btnHistorico = document.getElementById("btn-historico");
const inputDataSemana = document.getElementById("data-semana");
const btnSemanaProxima = document.getElementById("btn-semana-proxima");
const legendaSemana = document.getElementById("legenda-semana");
const filtrosHistoricoDiv = document.getElementById("filtros-historico");
const dataInicialEl = document.getElementById("data-inicial");
const dataFinalEl = document.getElementById("data-final");
const btnAplicarHistorico = document.getElementById("btn-aplicar-historico");
const btnMesAtual = document.getElementById("btn-mes-atual");

// Nova lógica: modal de confirmação
let modalFinalizarDia = null;

let perfilUsuario = "dono";
let meuUid = null;
let modoAgenda = "dia"; // Padrão: dia

const diasDaSemanaArr = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

// ----------- UTILITÁRIOS -----------
function mostrarToast(texto, cor = "#38bdf8") {
  if (typeof Toastify !== "undefined") {
    Toastify({
      text: texto,
      duration: 4000,
      gravity: "top",
      position: "center",
      style: { background: cor, color: "white", borderRadius: "8px" },
    }).showToast();
  } else {
    alert(texto);
  }
}
function formatarDataISO(data) {
  const off = data.getTimezoneOffset();
  const dataLocal = new Date(data.getTime() - off * 60 * 1000);
  return dataLocal.toISOString().split("T")[0];
}
function formatarDataBrasileira(dataISO) {
  if (!dataISO || dataISO.length !== 10) return dataISO;
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ----------- EXPEDIENTE PROFISSIONAIS -----------

async function expedienteAcabou(empresaId, dataISO) {
  const profs = await getDocs(collection(db, "empresarios", empresaId, "profissionais"));
  let maxFim = null;
  const dt = new Date(`${dataISO}T00:00:00`);
  const nomeDia = diasDaSemanaArr[dt.getDay()];
  for (const docProf of profs.docs) {
    const horariosRef = doc(db, "empresarios", empresaId, "profissionais", docProf.id, "configuracoes", "horarios");
    const horariosSnap = await getDoc(horariosRef);
    if (!horariosSnap.exists()) continue;
    const conf = horariosSnap.data();
    if (conf[nomeDia] && conf[nomeDia].ativo && conf[nomeDia].blocos && conf[nomeDia].blocos.length > 0) {
      for (const bloco of conf[nomeDia].blocos) {
        if (!maxFim || bloco.fim > maxFim) maxFim = bloco.fim;
      }
    }
  }
  if (!maxFim) return true; // não há expediente hoje
  const [h, m] = maxFim.split(":").map(Number);
  const fimExpediente = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), h, m);
  return Date.now() > fimExpediente.getTime();
}

// Regra extra: só pergunta ausência se o dia tinha expediente ativo
async function diaTemExpediente(empresaId, dataISO) {
  const profs = await getDocs(collection(db, "empresarios", empresaId, "profissionais"));
  const dt = new Date(`${dataISO}T00:00:00`);
  const nomeDia = diasDaSemanaArr[dt.getDay()];
  for (const docProf of profs.docs) {
    const horariosRef = doc(db, "empresarios", empresaId, "profissionais", docProf.id, "configuracoes", "horarios");
    const horariosSnap = await getDoc(horariosRef);
    if (!horariosSnap.exists()) continue;
    const conf = horariosSnap.data();
    if (conf[nomeDia] && conf[nomeDia].ativo && conf[nomeDia].blocos && conf[nomeDia].blocos.length > 0) {
      return true;
    }
  }
  return false;
}

async function encontrarProximoDiaComExpediente(empresaId, dataInicialISO) {
  let data = new Date(`${dataInicialISO}T00:00:00`);
  for (let i = 0; i < 14; i++) { // até 2 semanas
    const nomeDia = diasDaSemanaArr[data.getDay()];
    const profs = await getDocs(collection(db, "empresarios", empresaId, "profissionais"));
    for (const docProf of profs.docs) {
      const horariosRef = doc(db, "empresarios", empresaId, "profissionais", docProf.id, "configuracoes", "horarios");
      const horariosSnap = await getDoc(horariosRef);
      if (!horariosSnap.exists()) continue;
      const conf = horariosSnap.data();
      if (conf[nomeDia] && conf[nomeDia].ativo && conf[nomeDia].blocos && conf[nomeDia].blocos.length > 0) {
        return data.toISOString().split("T")[0];
      }
    }
    data.setDate(data.getDate() + 1);
  }
  return dataInicialISO; // fallback para o mesmo dia se não encontrar
}

// ----------- LÓGICA DE DATAS -----------
function getFimSemana(dataBaseStr) {
  const [ano, mes, dia] = dataBaseStr.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, dia);
  const diaDaSemana = inicio.getDay();
  const diasAteDomingo = 7 - diaDaSemana;
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + diasAteDomingo - 1);
  return formatarDataISO(fim);
}
function atualizarLegendaSemana(inicioISO, fimISO) {
  if (legendaSemana) {
    legendaSemana.innerHTML = `Mostrando de <strong>${formatarDataBrasileira(inicioISO)}</strong> a <strong>${formatarDataBrasileira(fimISO)}</strong>`;
  }
}
function agendamentoJaVenceu(dataISO, horarioStr, horarioFimExpediente) {
  if (!dataISO) return false;
  if (horarioFimExpediente) {
    const [ano, mes, dia] = dataISO.split("-").map(Number);
    const [horaFim, minFim] = horarioFimExpediente.split(":").map(Number);
    const dataFimExp = new Date(ano, mes - 1, dia, horaFim, minFim, 0, 0);
    return Date.now() > dataFimExp.getTime();
  }
  if (!horarioStr) return false;
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const [hora, min] = horarioStr.split(":").map(Number);
  const dataAg = new Date(ano, mes - 1, dia, hora, min, 0, 0);
  return dataAg.getTime() < Date.now();
}
function isDataAnteriorOuHoje(dataISO) {
  const hojeISO = formatarDataISO(new Date());
  return dataISO <= hojeISO;
}

// ----------- AUTENTICAÇÃO E PERFIL -----------
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");
  meuUid = user.uid;
  try {
    perfilUsuario = await checarTipoUsuario(user.uid, empresaId);
    await inicializarPaginaAgenda();
  } catch (error) {
    exibirMensagemDeErro("Ocorreu um erro ao iniciar a página.");
    console.error("Erro na inicialização:", error);
  }
});

async function checarTipoUsuario(uid, empresaId) {
  const docEmp = await getDocs(
    query(
      collection(db, "empresarios"),
      where("donoId", "==", uid),
      where("__name__", "==", empresaId)
    )
  );
  return docEmp.empty ? "funcionario" : "dono";
}

// ----------- INICIALIZAÇÃO DA PÁGINA/FILTRO INTELIGENTE -----------
async function inicializarPaginaAgenda() {
  if (perfilUsuario === "dono") {
    await popularFiltroProfissionais();
  } else {
    document.getElementById("filtro-profissional-item").style.display = "none";
  }
  let hojeISO = formatarDataISO(new Date());
  let acabou = await expedienteAcabou(empresaId, hojeISO);
  let dataFiltrar = hojeISO;
  if (acabou) {
    dataFiltrar = await encontrarProximoDiaComExpediente(empresaId, hojeISO);
  }
  inputDataSemana.value = dataFiltrar;
  configurarListeners();
  ativarModoAgenda("dia");
}

function configurarListeners() {
  btnAgendaDia.addEventListener("click", async () => {
    let hojeISO = formatarDataISO(new Date());
    let acabou = await expedienteAcabou(empresaId, hojeISO);
    let dataFiltrar = hojeISO;
    if (acabou) {
      dataFiltrar = await encontrarProximoDiaComExpediente(empresaId, hojeISO);
    }
    inputDataSemana.value = dataFiltrar;
    ativarModoAgenda("dia");
  });
  btnAgendaSemana.addEventListener("click", () => ativarModoAgenda("semana"));
  btnHistorico.addEventListener("click", () => ativarModoAgenda("historico"));
  filtroProfissionalEl.addEventListener("change", carregarAgendamentosConformeModo);
  inputDataSemana.addEventListener("change", carregarAgendamentosConformeModo);
  btnSemanaProxima.addEventListener("click", () => {
    const [ano, mes, dia] = inputDataSemana.value.split("-").map(Number);
    const dataAtual = new Date(ano, mes - 1, dia);
    dataAtual.setDate(dataAtual.getDate() + 7);
    inputDataSemana.value = formatarDataISO(dataAtual);
    carregarAgendamentosConformeModo();
  });

  // CORREÇÃO DO FILTRO HISTÓRICO
  btnAplicarHistorico.addEventListener("click", function(e) {
    e.preventDefault(); // Evita qualquer ação submit caso o botão esteja em form.
    carregarAgendamentosHistorico();
  });
  btnMesAtual.addEventListener("click", () => {
    preencherCamposMesAtual();
    carregarAgendamentosHistorico();
  });

  listaAgendamentosDiv.addEventListener("click", async (e) => {
    const btnAusencia = e.target.closest(".btn-ausencia");
    if (btnAusencia) {
      const agendamentoId = btnAusencia.dataset.id;
      if (confirm("Marcar ausência deste cliente? Isso ficará registrado no histórico.")) {
        await marcarNaoCompareceu(agendamentoId);
      }
    }
  });
}

// ----------- FECHAMENTO DE DIAS PENDENTES (considera expediente ativo) -----------
async function checarFechamentoDiasPendentes(callbackQuandoFinalizar) {
  const hojeISO = formatarDataISO(new Date());
  const ref = collection(db, "empresarios", empresaId, "agendamentos");
  const queryRetroativos = query(
    ref,
    where("data", "<", hojeISO),
    where("status", "==", "ativo")
  );
  const snapshotRetroativos = await getDocs(queryRetroativos);

  if (!window._finalizouDiasRetroativos && !snapshotRetroativos.empty) {
    const diasPendentes = {};
    snapshotRetroativos.docs.forEach((docSnap) => {
      const ag = docSnap.data();
      if (!diasPendentes[ag.data]) diasPendentes[ag.data] = [];
      diasPendentes[ag.data].push(docSnap);
    });
    const diasOrdenados = Object.keys(diasPendentes).sort();
    const dataPend = diasOrdenados[0];
    const docsPend = diasPendentes[dataPend];
    if (await expedienteAcabou(empresaId, dataPend) && await diaTemExpediente(empresaId, dataPend)) {
      exibirCardsAgendamento(docsPend, false);
      exibirModalFinalizarDia(docsPend, dataPend, async () => {
        window._finalizouDiasRetroativos = false;
        await checarFechamentoDiasPendentes(callbackQuandoFinalizar);
      });
      window._finalizouDiasRetroativos = true;
      return;
    }
  }
  window._finalizouDiasRetroativos = false;
  if (typeof callbackQuandoFinalizar === "function") callbackQuandoFinalizar();
}

// ----------- FUNÇÃO PARA MARCAR AUSÊNCIA -----------
async function marcarNaoCompareceu(agendamentoId) {
  try {
    const agRef = doc(db, "empresarios", empresaId, "agendamentos", agendamentoId);
    await updateDoc(agRef, { status: "nao_compareceu" });
    mostrarToast("Agendamento marcado como ausência.", "#f59e42");
    carregarAgendamentosConformeModo();
  } catch (error) {
    mostrarToast("Erro ao marcar ausência.", "#ef4444");
  }
}

function carregarAgendamentosConformeModo() {
  if (modoAgenda === "semana") {
    carregarAgendamentosSemana();
  } else if (modoAgenda === "historico") {
    carregarAgendamentosHistorico();
  } else {
    carregarAgendamentosDiaAtual();
  }
}

function ativarModoAgenda(modo) {
  modoAgenda = modo;
  document.getElementById("filtros-semana-container").style.display =
    modo === "semana" || modo === "dia" ? "flex" : "none";
  filtrosHistoricoDiv.style.display = modo === "historico" ? "flex" : "none";
  btnAgendaDia.classList.toggle("active", modo === "dia");
  btnAgendaSemana.classList.toggle("active", modo === "semana");
  btnHistorico.classList.toggle("active", modo === "historico");
  carregarAgendamentosConformeModo();
}

// ----------- FILTRO PROFISSIONAL -----------
async function popularFiltroProfissionais() {
  try {
    const snapshot = await getDocs(collection(db, "empresarios", empresaId, "profissionais"));
    filtroProfissionalEl.innerHTML =
      '<option value="todos">Todos os Profissionais</option>';
    snapshot.forEach((doc) => {
      filtroProfissionalEl.appendChild(new Option(doc.data().nome, doc.id));
    });
  } catch (error) {
    mostrarToast("Erro ao buscar profissionais.", "#ef4444");
  }
}

// ----------- CARREGAMENTO DE AGENDAMENTOS -----------
async function buscarEExibirAgendamentos(constraints, mensagemVazio, isHistorico = false) {
  listaAgendamentosDiv.innerHTML = `<p>Carregando agendamentos...</p>`;
  try {
    await checarFechamentoDiasPendentes(async () => {
      const ref = collection(db, "empresarios", empresaId, "agendamentos");
      const q = query(ref, ...constraints, orderBy("data"), orderBy("horario"));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        exibirCardsAgendamento([], isHistorico);
        return;
      }

      let profConfigs = {};
      let profissionaisIds = new Set();
      snapshot.docs.forEach((docSnap) => {
        const ag = docSnap.data();
        if (ag.profissionalId) profissionaisIds.add(ag.profissionalId);
      });
      const profConfigsArr = await Promise.all(
        Array.from(profissionaisIds).map(async (profId) => {
          const horariosRef = doc(db, "empresarios", empresaId, "profissionais", profId, "configuracoes", "horarios");
          const horariosSnap = await getDoc(horariosRef);
          return { profId, horarios: horariosSnap.exists() ? horariosSnap.data() : null };
        })
      );
      profConfigsArr.forEach(({ profId, horarios }) => {
        profConfigs[profId] = horarios;
      });

      const docsVencidos = [];
      let ultimoHorarioDia = null;
      let dataReferencia = null;
      let horarioFimExpediente = null;
      snapshot.docs.forEach((docSnap) => {
        const ag = docSnap.data();
        let horarioFim = null;
        if (ag.profissionalId && ag.data) {
          const dt = new Date(`${ag.data}T00:00:00`);
          const nomeDia = diasDaSemanaArr[dt.getDay()];
          const profHorarios = profConfigs[ag.profissionalId];
          if (
            profHorarios &&
            profHorarios[nomeDia] &&
            profHorarios[nomeDia].ativo
          ) {
            const blocos = profHorarios[nomeDia].blocos || [];
            if (blocos.length > 0) {
              horarioFim = blocos[blocos.length - 1].fim;
            }
          }
        }
        ag.horarioFimExpediente = horarioFim;

        if (
          ag.status === "ativo" &&
          agendamentoJaVenceu(ag.data, ag.horario, ag.horarioFimExpediente)
        ) {
          docsVencidos.push(docSnap);
        }
        if (!isHistorico && ag.data) {
          if (!dataReferencia) dataReferencia = ag.data;
          if (ag.data === dataReferencia) {
            if (!ultimoHorarioDia || ag.horario > ultimoHorarioDia) {
              ultimoHorarioDia = ag.horario;
            }
            if (
              ag.horarioFimExpediente &&
              (!horarioFimExpediente ||
                ag.horarioFimExpediente > horarioFimExpediente)
            ) {
              horarioFimExpediente = ag.horarioFimExpediente;
            }
          }
        }
      });

      if (
        docsVencidos.length > 0 &&
        ((dataReferencia &&
          isDataAnteriorOuHoje(dataReferencia) &&
          agendamentoJaVenceu(
            dataReferencia,
            ultimoHorarioDia,
            horarioFimExpediente
          ) &&
          await expedienteAcabou(empresaId, dataReferencia) &&
          await diaTemExpediente(empresaId, dataReferencia)) ||
          (dataReferencia && dataReferencia < formatarDataISO(new Date())))
      ) {
        exibirCardsAgendamento(snapshot.docs, isHistorico, horarioFimExpediente);
        exibirModalFinalizarDia(docsVencidos, dataReferencia);
        return;
      }

      exibirCardsAgendamento(snapshot.docs, isHistorico, horarioFimExpediente);
    });
  } catch (error) {
    exibirMensagemDeErro("Ocorreu um erro ao carregar os agendamentos.");
    console.error(error);
  }
}

function exibirModalFinalizarDia(docsVencidos, dataReferencia, onFinalizarDia) {
  if (modalFinalizarDia) modalFinalizarDia.remove();

  modalFinalizarDia = document.createElement("div");
  modalFinalizarDia.className = "modal-finalizar-dia";
  modalFinalizarDia.innerHTML = `
        <div class="modal-finalizar-dia__content">
            <h3>Finalizar dia ${formatarDataBrasileira(dataReferencia)}</h3>
            <p>Você deseja marcar alguma ausência para os agendamentos deste dia antes de finalizar? Todos os agendamentos ainda "ativos" serão marcados como "realizado" após a finalização.</p>
            <button id="btn-finalizar-dia">Finalizar dia</button>
            <button id="btn-fechar-modal">Fechar</button>
        </div>
        <style>
        .modal-finalizar-dia {
            position: fixed; z-index: 9999; left: 0; top: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
        }
        .modal-finalizar-dia__content {
            background: #fff; border-radius: 10px; padding: 24px; box-shadow: 0 8px 32px #0003; max-width: 370px;
            text-align: center;
        }
        .modal-finalizar-dia__content button {
            margin: 10px 8px 0 8px; padding: 8px 20px; font-size: 1rem; border-radius: 6px; border: none;
            background: #38bdf8; color: #fff; cursor: pointer;
        }
        #btn-fechar-modal { background: #aaa; }
        </style>
    `;
  document.body.appendChild(modalFinalizarDia);

  document.getElementById("btn-finalizar-dia").onclick = async () => {
    const updates = [];
    for (const docSnap of docsVencidos) {
      const ag = docSnap.data();
      if (
        ag.status === "ativo" &&
        agendamentoJaVenceu(ag.data, ag.horario, ag.horarioFimExpediente) &&
        ag.status !== "nao_compareceu" &&
        ag.status !== "cancelado" &&
        ag.status !== "cancelado_pelo_gestor"
      ) {
        updates.push(
          updateDoc(
            doc(
              db,
              "empresarios",
              empresaId,
              "agendamentos",
              docSnap.id
            ),
            { status: "realizado" }
          )
        );
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    mostrarToast("Agendamentos finalizados como 'realizado'.");
    modalFinalizarDia.remove();
    if (typeof onFinalizarDia === "function") await onFinalizarDia();
  };
  document.getElementById("btn-fechar-modal").onclick = () => {
    modalFinalizarDia.remove();
  };
}

// ----------- CARD PADRÃO MAIS BONITO -----------
function exibirCardsAgendamento(docs, isHistorico, horarioFimExpediente) {
  listaAgendamentosDiv.innerHTML = "";
  docs.forEach((doc) => {
    const ag = { id: doc.id, ...doc.data() };

    if (!isHistorico && ag.status !== "ativo") {
      return;
    }

    let statusLabel = "<span class='status-label status-ativo'>Ativo</span>";
    if (ag.status === "cancelado_pelo_gestor" || ag.status === "cancelado")
      statusLabel = "<span class='status-label status-cancelado'>Cancelado</span>";
    else if (ag.status === "nao_compareceu")
      statusLabel = "<span class='status-label status-falta'>Falta</span>";
    else if (ag.status === "realizado")
      statusLabel = "<span class='status-label status-realizado'>Realizado</span>";

    const cardElement = document.createElement("div");
    cardElement.className = "card card--agenda";
    cardElement.innerHTML = `
            <div class="card-title">${ag.servicoNome || "Serviço não informado"}</div>
            <div class="card-info">
                <p><b>Cliente:</b> ${ag.clienteNome || "Não informado"}</p>
                <p><b>Profissional:</b> ${ag.profissionalNome || "Não informado"}</p>
                <p>
                    <i class="fa-solid fa-calendar-day"></i>
                    <span class="card-agenda-dia">${formatarDataBrasileira(ag.data)}</span>
                    <i class="fa-solid fa-clock"></i>
                    <span class="card-agenda-hora">${ag.horario || "Não informada"}</span>
                </p>
                <p><b>Status:</b> ${statusLabel}</p>
                ${
                  ag.horarioFimExpediente
                    ? `<p><b>Fim do expediente:</b> ${ag.horarioFimExpediente}</p>`
                    : ""
                }
            </div>
            ${
              !isHistorico && ag.status === "ativo"
                ? `
                <div class="card-actions">
                    <button class="btn-ausencia" data-id="${ag.id}" title="Marcar ausência">
                        <i class="fa-solid fa-user-slash"></i> Ausência
                    </button>
                </div>
                `
                : ""
            }
        `;
    listaAgendamentosDiv.appendChild(cardElement);
  });

  if (listaAgendamentosDiv.childElementCount === 0) {
    const cardPadrao = document.createElement("div");
    cardPadrao.className = "card card--agenda card--padrao-pronti";
    cardPadrao.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
                <div style="font-size:3em;margin-bottom:8px;color:#38bdf8;"><i class="fa-solid fa-calendar-check"></i></div>
                <div class="card-title" style="color:#38bdf8;text-align:center;">Nenhum agendamento encontrado</div>
                <div class="card-info" style="text-align:center;">
                    <p style="margin:8px 0 0 0;">Sua agenda está livre para o período selecionado.<br>Que tal criar um novo agendamento? 😎</p>
                </div>
            </div>
        `;
    cardPadrao.style.background =
      "linear-gradient(135deg, #e0f7fa 60%, #b2ebf2 100%)";
    cardPadrao.style.borderRadius = "14px";
    cardPadrao.style.boxShadow = "0 4px 20px #0001";
    cardPadrao.style.padding = "36px 18px 28px 18px";
    cardPadrao.style.maxWidth = "330px";
    cardPadrao.style.margin = "32px auto";
    listaAgendamentosDiv.appendChild(cardPadrao);
  }
}

// ----------- MODO DIA (INTELIGENTE) -----------
function carregarAgendamentosDiaAtual() {
  const diaSelecionado = inputDataSemana.value;
  atualizarLegendaSemana(diaSelecionado, diaSelecionado);
  const constraints = [where("data", "==", diaSelecionado)];
  const profissionalId = perfilUsuario === "dono" ? filtroProfissionalEl.value : meuUid;
  if (profissionalId !== "todos") {
    constraints.push(where("profissionalId", "==", profissionalId));
  }
  buscarEExibirAgendamentos(constraints, "Nenhum agendamento ativo para este dia.");
}

// ----------- MODO SEMANA -----------
function carregarAgendamentosSemana() {
  const diaSelecionado = inputDataSemana.value;
  const fimISO = getFimSemana(diaSelecionado);
  atualizarLegendaSemana(diaSelecionado, fimISO);
  const constraints = [
    where("data", ">=", diaSelecionado),
    where("data", "<=", fimISO),
  ];
  const profissionalId = perfilUsuario === "dono" ? filtroProfissionalEl.value : meuUid;
  if (profissionalId !== "todos") {
    constraints.push(where("profissionalId", "==", profissionalId));
  }
  buscarEExibirAgendamentos(constraints, "Nenhum agendamento ativo para este período.");
}

// ----------- MODO HISTÓRICO -----------
function carregarAgendamentosHistorico() {
  const dataIni = dataInicialEl.value;
  const dataFim = dataFinalEl.value;
  if (!dataIni || !dataFim) {
    mostrarToast("Por favor, selecione as datas de início e fim.", "#ef4444");
    return;
  }
  atualizarLegendaSemana(dataIni, dataFim);
  const constraints = [
    where("data", ">=", dataIni),
    where("data", "<=", dataFim),
  ];
  const profissionalId = perfilUsuario === "dono" ? filtroProfissionalEl.value : meuUid;
  if (profissionalId !== "todos") {
    constraints.push(where("profissionalId", "==", profissionalId));
  }
  buscarEExibirAgendamentos(constraints, "Nenhum agendamento encontrado no histórico para este período.", true);
}

// ----------- FUNÇÕES AUXILIARES -----------
function preencherCamposMesAtual() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  if (dataInicialEl) dataInicialEl.value = formatarDataISO(primeiroDia);
  if (dataFinalEl) dataFinalEl.value = formatarDataISO(ultimoDia);
}

function exibirMensagemDeErro(mensagem) {
  if (listaAgendamentosDiv) {
    listaAgendamentosDiv.innerHTML = `<p style='color: #ef4444; text-align: center;'>${mensagem}</p>`;
  }
}
