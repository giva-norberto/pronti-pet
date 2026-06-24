/**
 * agenda.js - Pronti Pet
 * - Agenda com fundo cinza e card pet compacto.
 * - Mantém menu lateral original do Pronti.
 * - Mostra Pet, Tutor, Profissional, observações e foto preparada.
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
import { abrirPainelAtendimento } from "./painel-atendimento.js";
let empresaId = localStorage.getItem("empresaAtivaId");
if (!empresaId) {
  window.location.href = "selecionar-empresa.html";
  throw new Error("Nenhuma empresa ativa encontrada.");
}

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

let modalFinalizarDia = null;
let perfilUsuario = "dono";
let meuUid = null;
let modoAgenda = "dia";

const diasDaSemanaArr = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

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

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function montarCaminhoFotoPet(ag) {
  if (ag.petFotoPath) return ag.petFotoPath;

  if (ag.empresaId && ag.clienteId && ag.petId) {
    return `empresarios/${ag.empresaId}/clientes/${ag.clienteId}/pets/${ag.petId}/fotoPet.jpg`;
  }

  if (empresaId && ag.clienteId && ag.petId) {
    return `empresarios/${empresaId}/clientes/${ag.clienteId}/pets/${ag.petId}/fotoPet.jpg`;
  }

  return "";
}

function aplicarEstiloAgendaPet() {
  if (document.getElementById("style-agenda-pet-cards")) return;

  const style = document.createElement("style");
  style.id = "style-agenda-pet-cards";
  style.textContent = `
    body {
      background: #eef2f7;
      overflow-x: hidden;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    main,
    .main-content,
    .content,
    .page-content,
    .dashboard-content {
      background: #eef2f7 !important;
    }

    #lista-agendamentos {
      background: #eef2f7;
      padding: 18px;
      border-radius: 20px;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
    }

    .card--agenda {
      background: #ffffff !important;
      border: 1px solid #dbe3ef !important;
      border-radius: 18px !important;
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.13) !important;
      overflow: hidden !important;
      margin: 0 auto 18px auto !important;
      max-width: 1180px;
      width: 100%;
    }

    .agenda-pet-card-header {
      background: linear-gradient(135deg, #312e81 0%, #4338ca 48%, #6366f1 100%);
      color: #ffffff;
      padding: 14px 18px;
    }

    .agenda-pet-header-grid {
      display: grid;
      grid-template-columns: minmax(220px, 1.35fr) minmax(180px, 1fr) auto;
      gap: 14px;
      align-items: center;
    }

    .agenda-pet-identidade {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .agenda-pet-foto,
    .agenda-pet-foto-placeholder {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      flex-shrink: 0;
      border: 3px solid rgba(255, 255, 255, .75);
      box-shadow: 0 8px 18px rgba(15, 23, 42, .20);
      background: rgba(255,255,255,.16);
    }

    .agenda-pet-foto {
      object-fit: cover;
    }

    .agenda-pet-foto-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.7rem;
    }

    .agenda-pet-kicker {
      font-size: .72rem;
      font-weight: 900;
      opacity: .88;
      text-transform: uppercase;
      letter-spacing: .06em;
      white-space: nowrap;
    }

    .agenda-pet-nome {
      font-size: 1.35rem;
      font-weight: 950;
      line-height: 1.1;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agenda-pet-sub {
      font-size: .9rem;
      font-weight: 750;
      opacity: .95;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agenda-pet-servico-top {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 950;
      font-size: 1rem;
      min-width: 0;
    }

    .agenda-pet-servico-icone {
      width: 36px;
      height: 36px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,.16);
      flex-shrink: 0;
    }

    .agenda-pet-data-hora {
      display: flex;
      align-items: center;
      gap: 14px;
      white-space: nowrap;
      font-weight: 950;
      font-size: .96rem;
      justify-content: flex-end;
    }

    .agenda-pet-data-hora span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .agenda-pet-body {
      padding: 14px 18px 16px 18px;
      background: #ffffff;
    }

    .agenda-pet-alert-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
      margin-bottom: 12px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .agenda-pet-alert-grid--full {
      grid-template-columns: minmax(0, 1fr);
    }

    .agenda-pet-alerta,
    .agenda-pet-info {
      padding: 11px 13px;
      border-radius: 14px;
      display: flex;
      gap: 11px;
      align-items: flex-start;
      min-height: 50px;
      min-width: 0;
      max-width: 100%;
      width: 100%;
    }

    .agenda-pet-alerta {
      background: #fff7ed;
      border: 1.5px solid #fb923c;
      color: #7c2d12;
    }

    .agenda-pet-info {
      background: #fffbeb;
      border: 1.5px solid #facc15;
      color: #78350f;
    }

    .agenda-pet-alert-icon {
      width: 36px;
      height: 36px;
      border-radius: 13px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,.55);
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .agenda-pet-box-title {
      font-weight: 950;
      margin-bottom: 3px;
    }

    .agenda-pet-box-text {
      white-space: pre-wrap;
      line-height: 1.36;
      font-weight: 600;
    }

    .agenda-pet-pessoa-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
      gap: 10px;
      align-items: stretch;
      width: 100%;
      max-width: 100%;
    }

    .agenda-pet-pet-tutor,
    .agenda-pet-profissional {
      border-radius: 14px;
      padding: 11px 13px;
      border: 1px solid #dbeafe;
      min-width: 0;
      max-width: 100%;
    }

    .agenda-pet-pet-tutor {
      background: #f8fbff;
    }

    .agenda-pet-profissional {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }

    .agenda-pet-mini-label {
      color: #4f46e5;
      font-size: .78rem;
      font-weight: 950;
      margin-bottom: 4px;
    }

    .agenda-pet-mini-value {
      color: #0f172a;
      font-size: .96rem;
      font-weight: 950;
    }

    .agenda-pet-footer {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: flex-end;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #edf2f7;
    }

    .agenda-pet-status-linha {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: #334155;
      font-weight: 800;
      margin-right: auto;
    }

    .agenda-pet-botao-ausencia {
      border: 1.5px solid #fecaca;
      background: #fff1f2;
      color: #dc2626;
      padding: 10px 16px;
      border-radius: 13px;
      font-weight: 950;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .agenda-pet-botao-ausencia:hover {
      background: #ffe4e6;
    }

    .status-label {
      display: inline-flex;
      align-items: center;
      padding: 7px 13px;
      border-radius: 999px;
      font-weight: 900;
      font-size: .82rem;
    }

        .status-ativo {
      width: 14px;
      height: 14px;
      padding: 0;
      border-radius: 999px;
      background: #22c55e;
      color: transparent;
      font-size: 0;
      box-shadow: 0 0 0 4px #dcfce7;
      flex-shrink: 0;
    }

    .status-cancelado { background: #fee2e2; color: #b91c1c; }
    .status-falta { background: #ffedd5; color: #c2410c; }
    .status-realizado { background: #e0f2fe; color: #0369a1; }

    #filtro-profissional,
    #data-semana,
    #data-inicial,
    #data-final {
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid #dbe3ef;
      background: #ffffff;
      color: #0f172a;
      font-weight: 700;
      padding: 8px 12px;
      outline: none;
      box-shadow: 0 4px 12px rgba(15, 23, 42, .06);
    }

    #btn-agenda-dia,
    #btn-agenda-semana,
    #btn-historico,
    #btn-semana-proxima,
    #btn-aplicar-historico,
    #btn-mes-atual {
      border-radius: 12px;
      border: 1px solid #dbe3ef;
      background: #ffffff;
      color: #334155;
      font-weight: 900;
      min-height: 42px;
      padding: 8px 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(15, 23, 42, .06);
    }

    #btn-agenda-dia.active,
    #btn-agenda-semana.active,
    #btn-historico.active {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: #ffffff;
      border-color: transparent;
    }

    @media (max-width: 900px) {
      #lista-agendamentos {
        padding: 12px;
      }

      .card--agenda {
        border-radius: 16px !important;
        margin-bottom: 14px !important;
        max-width: 100% !important;
      }

      .agenda-pet-header-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .agenda-pet-data-hora {
        justify-content: flex-start;
        width: 100%;
        flex-wrap: wrap;
      }

      .agenda-pet-alert-grid,
      .agenda-pet-alert-grid--full,
      .agenda-pet-pessoa-grid {
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100%;
        max-width: 100%;
      }

      .agenda-pet-footer {
        align-items: stretch;
        flex-direction: row;
        justify-content: space-between;
        flex-wrap: wrap;
      }

      .agenda-pet-status-linha {
        display: none;
      }

      .agenda-pet-botao-ausencia {
        flex: 1;
        justify-content: center;
      }
    }

    @media (max-width: 520px) {
      .agenda-pet-card-header {
        padding: 13px;
      }

      .agenda-pet-body {
        padding: 12px;
      }

      .agenda-pet-identidade {
        align-items: flex-start;
      }

      .agenda-pet-foto,
      .agenda-pet-foto-placeholder {
        width: 52px;
        height: 52px;
        border-radius: 16px;
      }

      .agenda-pet-nome {
        font-size: 1.18rem;
      }

      .agenda-pet-servico-top {
        font-size: .95rem;
      }

      .status-label {
        padding: 9px 13px;
      }
      
      .status-label.status-ativo {
        padding: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

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

  if (!maxFim) return true;
  const [h, m] = maxFim.split(":").map(Number);
  const fimExpediente = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), h, m);
  return Date.now() > fimExpediente.getTime();
}

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

  for (let i = 0; i < 14; i++) {
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

  return dataInicialISO;
}

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

async function inicializarPaginaAgenda() {
  aplicarEstiloAgendaPet();

  if (perfilUsuario === "dono") {
    await popularFiltroProfissionais();
  } else {
    const filtroItem = document.getElementById("filtro-profissional-item");
    if (filtroItem) filtroItem.style.display = "none";
  }

  let hojeISO = formatarDataISO(new Date());
  let acabou = await expedienteAcabou(empresaId, hojeISO);
  let dataFiltrar = hojeISO;

  if (acabou) {
    dataFiltrar = await encontrarProximoDiaComExpediente(empresaId, hojeISO);
  }

  if (inputDataSemana) inputDataSemana.value = dataFiltrar;
  configurarListeners();
  ativarModoAgenda("dia");
}

function configurarListeners() {
  if (btnAgendaDia) {
    btnAgendaDia.addEventListener("click", async () => {
      let hojeISO = formatarDataISO(new Date());
      let acabou = await expedienteAcabou(empresaId, hojeISO);
      let dataFiltrar = hojeISO;

      if (acabou) {
        dataFiltrar = await encontrarProximoDiaComExpediente(empresaId, hojeISO);
      }

      if (inputDataSemana) inputDataSemana.value = dataFiltrar;
      ativarModoAgenda("dia");
    });
  }

  if (btnAgendaSemana) {
    btnAgendaSemana.addEventListener("click", () => ativarModoAgenda("semana"));
  }

  if (btnHistorico) {
    btnHistorico.addEventListener("click", () => ativarModoAgenda("historico"));
  }

  if (filtroProfissionalEl) {
    filtroProfissionalEl.addEventListener("change", carregarAgendamentosConformeModo);
  }

  if (inputDataSemana) {
    inputDataSemana.addEventListener("change", carregarAgendamentosConformeModo);
  }

  if (btnSemanaProxima) {
    btnSemanaProxima.addEventListener("click", () => {
      if (!inputDataSemana || !inputDataSemana.value) return;

      const [ano, mes, dia] = inputDataSemana.value.split("-").map(Number);
      const dataAtual = new Date(ano, mes - 1, dia);
      dataAtual.setDate(dataAtual.getDate() + 7);
      inputDataSemana.value = formatarDataISO(dataAtual);
      carregarAgendamentosConformeModo();
    });
  }

  if (btnAplicarHistorico) {
    btnAplicarHistorico.addEventListener("click", function(e) {
      e.preventDefault();
      carregarAgendamentosHistorico();
    });
  }

  if (btnMesAtual) {
    btnMesAtual.addEventListener("click", () => {
      preencherCamposMesAtual();
      carregarAgendamentosHistorico();
    });
  }

  if (listaAgendamentosDiv) {
    listaAgendamentosDiv.addEventListener("click", async (e) => {
      const btnAusencia = e.target.closest(".btn-ausencia");

      if (btnAusencia) {
        e.stopPropagation();

        const agendamentoId = btnAusencia.dataset.id;

        if (confirm("Marcar ausência deste cliente? Isso ficará registrado no histórico.")) {
          await marcarNaoCompareceu(agendamentoId);
        }

        return;
      }

      const cardAtendimento = e.target.closest(".card--agenda[data-agendamento-id]");

      if (cardAtendimento) {
        const agendamentoId = cardAtendimento.dataset.agendamentoId;

        await abrirPainelAtendimento(empresaId, agendamentoId);
      }
    });
  }
}

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

  const filtrosSemanaContainer = document.getElementById("filtros-semana-container");

  if (filtrosSemanaContainer) {
    filtrosSemanaContainer.style.display =
      modo === "semana" || modo === "dia" ? "flex" : "none";
  }

  if (filtrosHistoricoDiv) {
    filtrosHistoricoDiv.style.display = modo === "historico" ? "flex" : "none";
  }

  if (btnAgendaDia) btnAgendaDia.classList.toggle("active", modo === "dia");
  if (btnAgendaSemana) btnAgendaSemana.classList.toggle("active", modo === "semana");
  if (btnHistorico) btnHistorico.classList.toggle("active", modo === "historico");

  carregarAgendamentosConformeModo();
}

async function popularFiltroProfissionais() {
  try {
    const snapshot = await getDocs(collection(db, "empresarios", empresaId, "profissionais"));
    filtroProfissionalEl.innerHTML = '<option value="todos">Todos os Profissionais</option>';

    snapshot.forEach((doc) => {
      filtroProfissionalEl.appendChild(new Option(doc.data().nome, doc.id));
    });
  } catch (error) {
    mostrarToast("Erro ao buscar profissionais.", "#ef4444");
  }
}

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

          return {
            profId,
            horarios: horariosSnap.exists() ? horariosSnap.data() : null
          };
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

function exibirCardsAgendamento(docs, isHistorico, horarioFimExpediente) {
  listaAgendamentosDiv.innerHTML = "";

  docs.forEach((doc) => {
    const ag = { id: doc.id, ...doc.data() };

    if (!isHistorico && ag.status !== "ativo") {
      return;
    }

    let statusLabel = "<span class='status-label status-ativo'>Ativo</span>";

    if (ag.status === "cancelado_pelo_gestor" || ag.status === "cancelado") {
      statusLabel = "<span class='status-label status-cancelado'>Cancelado</span>";
    } else if (ag.status === "nao_compareceu") {
      statusLabel = "<span class='status-label status-falta'>Falta</span>";
    } else if (ag.status === "realizado") {
      statusLabel = "<span class='status-label status-realizado'>Realizado</span>";
    }

    const observacaoPet = escaparHTML(String(ag.observacaoPet || "").trim());
    const observacaoAgendamento = escaparHTML(String(ag.observacaoAgendamento || "").trim());

    const quantidadeObservacoes =
      (observacaoAgendamento ? 1 : 0) +
      (observacaoPet ? 1 : 0);

    const classeGridObservacoes =
      quantidadeObservacoes === 1
        ? "agenda-pet-alert-grid agenda-pet-alert-grid--full"
        : "agenda-pet-alert-grid";

    const petNome = escaparHTML(ag.petNome || "Pet não informado");
    const petPorte = escaparHTML(ag.petPorte || "");
    const petRaca = escaparHTML(ag.petRaca || ag.racaPet || ag.raca || "");
    const clienteNome = escaparHTML(ag.clienteNome || "Tutor não informado");
    const profissionalNome = escaparHTML(ag.profissionalNome || "Profissional não informado");
    const servicoNome = escaparHTML(ag.servicoNome || "Serviço não informado");
    const horarioTexto = escaparHTML(ag.horario || "Horário não informado");
    const dataTexto = formatarDataBrasileira(ag.data);

    const porteFormatado = petPorte
      ? petPorte.charAt(0).toUpperCase() + petPorte.slice(1).toLowerCase()
      : "";

    const subtituloPet = petRaca && porteFormatado
      ? `${petRaca} • ${porteFormatado}`
      : petRaca || porteFormatado || "Porte não informado";

    const petFotoUrl = String(ag.petFotoUrl || ag.fotoPetUrl || ag.petFoto || "").trim();
    const petFotoPath = montarCaminhoFotoPet(ag);

    const fotoPetHtml = petFotoUrl
      ? `<img src="${escaparHTML(petFotoUrl)}" alt="Foto de ${petNome}" title="${escaparHTML(petFotoPath)}" class="agenda-pet-foto">`
      : `<div title="${escaparHTML(petFotoPath)}" class="agenda-pet-foto-placeholder">🐾</div>`;

    const cardElement = document.createElement("div");
    cardElement.className = "card card--agenda";

    if (!isHistorico && ag.status === "ativo") {
      cardElement.dataset.agendamentoId = ag.id;
      cardElement.style.cursor = "pointer";
      cardElement.title = "Clique para abrir o atendimento";
    }

    cardElement.innerHTML = `
      <div class="agenda-pet-card-header">
        <div class="agenda-pet-header-grid">
          <div class="agenda-pet-identidade">
            ${fotoPetHtml}
            <div style="min-width:0;">
              <div class="agenda-pet-kicker">PET</div>
              <div class="agenda-pet-nome">${petNome}</div>
              <div class="agenda-pet-sub">${subtituloPet}</div>
            </div>
          </div>

          <div class="agenda-pet-servico-top">
            <span class="agenda-pet-servico-icone">
              <i class="fa-solid fa-scissors"></i>
            </span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${servicoNome}
            </span>
          </div>

          <div class="agenda-pet-data-hora">
            <span><i class="fa-solid fa-calendar-day"></i> ${dataTexto}</span>
            <span><i class="fa-solid fa-clock"></i> ${horarioTexto}</span>
          </div>
        </div>
      </div>

      <div class="agenda-pet-body">
        ${
          observacaoAgendamento || observacaoPet
            ? `
              <div class="${classeGridObservacoes}">
                ${
                  observacaoAgendamento
                    ? `
                      <div class="agenda-pet-alerta">
                        <div class="agenda-pet-alert-icon">⚠️</div>
                        <div>
                          <div class="agenda-pet-box-title">Observação do atendimento</div>
                          <div class="agenda-pet-box-text">${observacaoAgendamento}</div>
                        </div>
                      </div>`
                    : ""
                }

                ${
                  observacaoPet
                    ? `
                      <div class="agenda-pet-info">
                        <div class="agenda-pet-alert-icon">📌</div>
                        <div>
                          <div class="agenda-pet-box-title">Informações do Pet</div>
                          <div class="agenda-pet-box-text">${observacaoPet}</div>
                        </div>
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }

        <div class="agenda-pet-pessoa-grid">
          <div class="agenda-pet-pet-tutor">
            <div class="agenda-pet-mini-label">👤 Tutor</div>
            <div class="agenda-pet-mini-value">${clienteNome}</div>
          </div>

          <div class="agenda-pet-profissional">
            <div class="agenda-pet-mini-label" style="color:#15803d;">🧑‍🔧 Banhista/Tosador</div>
            <div class="agenda-pet-mini-value">${profissionalNome}</div>
          </div>
        </div>

        <div class="agenda-pet-footer">
          <div class="agenda-pet-status-linha">
            ${
              ag.horarioFimExpediente
                ? `<span><b>Fim do expediente:</b> ${escaparHTML(ag.horarioFimExpediente)}</span>`
                : ""
            }
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:100%;">
            <span>${statusLabel}</span>

            ${
              !isHistorico && ag.status === "ativo"
                ? `<button class="btn-ausencia agenda-pet-botao-ausencia" data-id="${ag.id}" title="Marcar ausência">
                    <i class="fa-solid fa-user-slash"></i> Marcar ausência
                  </button>`
                : ""
            }
          </div>
        </div>

        ${
          petFotoPath
            ? `<p style="display:none;" data-pet-foto-path="${escaparHTML(petFotoPath)}"></p>`
            : ""
        }
      </div>
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

    cardPadrao.style.background = "linear-gradient(135deg, #e0f7fa 60%, #b2ebf2 100%)";
    cardPadrao.style.borderRadius = "14px";
    cardPadrao.style.boxShadow = "0 4px 20px #0001";
    cardPadrao.style.padding = "36px 18px 28px 18px";
    cardPadrao.style.maxWidth = "330px";
    cardPadrao.style.margin = "32px auto";

    listaAgendamentosDiv.appendChild(cardPadrao);
  }
}

function carregarAgendamentosDiaAtual() {
  const diaSelecionado = inputDataSemana?.value || formatarDataISO(new Date());
  atualizarLegendaSemana(diaSelecionado, diaSelecionado);

  const constraints = [where("data", "==", diaSelecionado)];
  const profissionalId = perfilUsuario === "dono" ? filtroProfissionalEl.value : meuUid;

  if (profissionalId !== "todos") {
    constraints.push(where("profissionalId", "==", profissionalId));
  }

  buscarEExibirAgendamentos(constraints, "Nenhum agendamento ativo para este dia.");
}

function carregarAgendamentosSemana() {
  const diaSelecionado = inputDataSemana?.value || formatarDataISO(new Date());
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

function carregarAgendamentosHistorico() {
  const dataIni = dataInicialEl?.value;
  const dataFim = dataFinalEl?.value;

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

  buscarEExibirAgendamentos(
    constraints,
    "Nenhum agendamento encontrado no histórico para este período.",
    true
  );
}

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
