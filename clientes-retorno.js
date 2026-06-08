import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const listaEl = document.getElementById("lista-retorno");
const loadingEl = document.getElementById("estado-loading");
const vazioEl = document.getElementById("estado-vazio");
const filtrosEl = document.getElementById("filtros-retorno");

const resumoTotalEl = document.getElementById("resumo-total");
const resumoAtrasadosEl = document.getElementById("resumo-atrasados");
const resumoHojeEl = document.getElementById("resumo-hoje");
const resumoEmBreveEl = document.getElementById("resumo-em-breve");

const functions = getFunctions(undefined, "southamerica-east1");
const avisarClienteRetornoFn = httpsCallable(functions, "avisarClienteRetorno");

let empresaId = null;
let retornoCalculado = [];
let filtroAtual = "todos";

function mostrarToast(texto, cor = "#ef4444") {
  if (typeof Toastify !== "undefined") {
    Toastify({
      text: texto,
      duration: 3500,
      gravity: "top",
      position: "right",
      style: { background: cor, color: "#fff" }
    }).showToast();
  } else {
    alert(texto);
  }
}

function normalizarDataISO(dataISO) {
  if (!dataISO || typeof dataISO !== "string") return null;
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

function formatarDataBR(dataISO) {
  const data = normalizarDataISO(dataISO);
  if (!data) return "-";
  return data.toLocaleDateString("pt-BR");
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

function textoStatus(status, dias) {
  switch (status) {
    case "atrasado":
      return dias < 0 ? `${Math.abs(dias)} dia(s) atrasado` : "Atrasado";
    case "hoje":
      return "Retorno hoje";
    case "em_breve":
      return dias === 1 ? "Retorno amanhã" : `Retorno em ${dias} dia(s)`;
    case "futuro":
      return `Retorno em ${dias} dia(s)`;
    case "sem_historico":
      return "Histórico insuficiente";
    default:
      return status;
  }
}

function buscarEmpresaAtiva() {
  return localStorage.getItem("empresaAtivaId");
}

async function buscarAgendamentosRealizados(empresaIdAtual) {
  const agRef = collection(db, "empresarios", empresaIdAtual, "agendamentos");
  const q = query(agRef, where("status", "==", "realizado"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

function agruparAgendamentosPorCliente(agendamentos) {
  const mapa = new Map();

  for (const ag of agendamentos) {
    const clienteId = ag.clienteId || "";
    const data = ag.data || "";

    if (!clienteId || !data) continue;

    if (!mapa.has(clienteId)) {
      mapa.set(clienteId, []);
    }

    mapa.get(clienteId).push(ag);
  }

  return mapa;
}

function calcularMediaIntervalosComDetalhes(datasISO) {
  if (!Array.isArray(datasISO) || datasISO.length < 2) {
    return {
      mediaDias: 0,
      intervalosValidos: 0
    };
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
    return {
      mediaDias: 0,
      intervalosValidos: 0
    };
  }

  const soma = intervalos.reduce((total, valor) => total + valor, 0);

  return {
    mediaDias: Math.round(soma / intervalos.length),
    intervalosValidos: intervalos.length
  };
}

function limparTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

async function buscarClientePorId(empresaIdAtual, clienteId) {
  if (!empresaIdAtual || !clienteId) return null;

  try {
    const clienteRef = doc(db, "empresarios", empresaIdAtual, "clientes", clienteId);
    const clienteSnap = await getDoc(clienteRef);

    if (!clienteSnap.exists()) return null;

    return {
      id: clienteSnap.id,
      ...clienteSnap.data()
    };
  } catch (error) {
    console.error("Erro ao buscar cliente no Firebase:", error);
    return null;
  }
}

function obterTelefoneDoClienteFirebase(cliente) {
  return (
    cliente?.telefone ||
    cliente?.celular ||
    cliente?.whatsapp ||
    cliente?.telefoneWhatsapp ||
    cliente?.clienteTelefone ||
    cliente?.clienteCelular ||
    ""
  );
}

function montarMensagemWhatsApp(item) {
  const nome = item.clienteNome || "cliente";
  const servico = item.ultimoServicoNome || "seu último serviço";
  const dataIdeal = item.proximaDataIdeal ? formatarDataBR(item.proximaDataIdeal) : "";

  if (dataIdeal) {
    return `Oi, ${nome}! 😊

Percebemos que já está na época ideal do seu retorno para ${servico}.

Sua data ideal de retorno é ${dataIdeal}.

Que tal agendar seu próximo horário?`;
  }

  return `Oi, ${nome}! 😊

Percebemos que já está na época ideal do seu retorno para ${servico}.

Que tal agendar seu próximo horário?`;
}

async function abrirWhatsAppCliente(item) {
  try {
    const cliente = await buscarClientePorId(empresaId, item.clienteId);
    const telefoneFirebase = obterTelefoneDoClienteFirebase(cliente);
    const telefoneLimpo = limparTelefone(telefoneFirebase);

    if (!telefoneLimpo) {
      mostrarToast("Cliente sem celular cadastrado.", "#ef4444");
      return;
    }

    const telefoneComPais = telefoneLimpo.startsWith("55")
      ? telefoneLimpo
      : `55${telefoneLimpo}`;

    const mensagem = montarMensagemWhatsApp(item);
    const url = `https://wa.me/${telefoneComPais}?text=${encodeURIComponent(mensagem)}`;

    window.open(url, "_blank");
  } catch (error) {
    console.error("Erro ao abrir WhatsApp do cliente:", error);
    mostrarToast("Erro ao abrir WhatsApp do cliente.", "#ef4444");
  }
}

function calcularRetornos(agendamentos) {
  const grupos = agruparAgendamentosPorCliente(agendamentos);
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
      clienteFoto: ultimoAtendimento?.clienteFoto || "",
      ultimoServicoNome: ultimoAtendimento?.servicoNome || "Não informado",
      profissionalNome: ultimoAtendimento?.profissionalNome || "-",
      dataUltimoAtendimento: ultimoAtendimento?.data || "",
      proximaDataIdeal: proximaData ? dataParaISO(proximaData) : "",
      mediaRetornoDias: mediaDias,
      diasParaRetorno,
      statusRetorno,
      quantidadeAtendimentosAnalisados: ultimosCinco.length,
      quantidadeIntervalosValidos: intervalosValidos
    });
  }

  calculados.sort((a, b) => {
    const ordem = {
      atrasado: 1,
      hoje: 2,
      em_breve: 3,
      futuro: 4,
      sem_historico: 5
    };

    const ordemA = ordem[a.statusRetorno] || 99;
    const ordemB = ordem[b.statusRetorno] || 99;

    if (ordemA !== ordemB) return ordemA - ordemB;

    if (a.proximaDataIdeal && b.proximaDataIdeal) {
      return a.proximaDataIdeal.localeCompare(b.proximaDataIdeal);
    }

    return a.clienteNome.localeCompare(b.clienteNome, "pt-BR");
  });

  return calculados;
}

function atualizarResumo(lista) {
  const atrasados = lista.filter((i) => i.statusRetorno === "atrasado").length;
  const hoje = lista.filter((i) => i.statusRetorno === "hoje").length;
  const emBreve = lista.filter((i) => i.statusRetorno === "em_breve").length;

  resumoTotalEl.textContent = String(lista.length);
  resumoAtrasadosEl.textContent = String(atrasados);
  resumoHojeEl.textContent = String(hoje);
  resumoEmBreveEl.textContent = String(emBreve);
}

function obterListaFiltrada() {
  if (filtroAtual === "todos") return retornoCalculado;
  return retornoCalculado.filter((item) => item.statusRetorno === filtroAtual);
}

async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard API falhou:", error);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const sucesso = document.execCommand("copy");
    document.body.removeChild(textarea);
    return sucesso;
  } catch (error) {
    console.warn("Fallback de cópia falhou:", error);
    return false;
  }
}

async function handleAvisarCliente(item, botao) {
  const textoOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = "Avisando...";

  try {
    const resposta = await avisarClienteRetornoFn({
      empresaId,
      clienteId: item.clienteId,
      clienteNome: item.clienteNome,
      statusRetorno: item.statusRetorno,
      proximaDataIdeal: item.proximaDataIdeal,
      ultimoServicoNome: item.ultimoServicoNome
    });

    const dados = resposta?.data || {};

    if (dados.enviadoPush) {
      mostrarToast("Aviso enviado por push com sucesso.", "#22c55e");
      return;
    }

    const mensagem = dados.mensagem || `Oi, ${item.clienteNome}! Quer agendar seu próximo horário?`;
    const copiou = await copiarTexto(mensagem);

    if (copiou) {
      mostrarToast("Cliente sem token. Mensagem copiada.", "#f59e0b");
    } else {
      mostrarToast("Cliente sem token. Não foi possível copiar a mensagem.", "#f59e0b");
    }
  } catch (error) {
    console.error("Erro ao avisar cliente:", error);
    mostrarToast("Erro ao avisar cliente.", "#ef4444");
  } finally {
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
  }
}

function renderizarLista() {
  const lista = obterListaFiltrada();

  listaEl.innerHTML = "";

  if (!lista.length) {
    listaEl.style.display = "none";
    vazioEl.style.display = "block";
    return;
  }

  vazioEl.style.display = "none";
  listaEl.style.display = "grid";

  for (const item of lista) {
    const card = document.createElement("div");
    card.className = "cliente-card";

    const foto = item.clienteFoto
      ? `<img class="cliente-foto" src="${item.clienteFoto}" alt="Foto de ${item.clienteNome}">`
      : `<div class="cliente-foto"></div>`;

    const badgeTexto = textoStatus(item.statusRetorno, item.diasParaRetorno ?? 0);

    card.innerHTML = `
      <div class="cliente-topo">
        <div class="cliente-info">
          ${foto}
          <div>
            <h3 class="cliente-nome">${item.clienteNome}</h3>
            <p class="cliente-sub">Último serviço: ${item.ultimoServicoNome}</p>
          </div>
        </div>

        <div class="badge-status status-${item.statusRetorno}">
          ${badgeTexto}
        </div>
      </div>

      <div class="cliente-grid">
        <div class="info-box">
          <div class="label">Último atendimento</div>
          <div class="texto">${formatarDataBR(item.dataUltimoAtendimento)}</div>
        </div>

        <div class="info-box">
          <div class="label">Próxima data ideal</div>
          <div class="texto">${item.proximaDataIdeal ? formatarDataBR(item.proximaDataIdeal) : "Histórico insuficiente"}</div>
        </div>

        <div class="info-box">
          <div class="label">Média de retorno</div>
          <div class="texto">${item.mediaRetornoDias ? `${item.mediaRetornoDias} dia(s)` : "Ainda sem média"}</div>
        </div>

        <div class="info-box">
          <div class="label">Atendimentos analisados</div>
          <div class="texto">${item.quantidadeAtendimentosAnalisados} atendimento(s)</div>
        </div>

        <div class="info-box">
          <div class="label">Intervalos válidos</div>
          <div class="texto">${item.quantidadeIntervalosValidos} intervalo(s)</div>
        </div>

        <div class="info-box">
          <div class="label">Profissional da última visita</div>
          <div class="texto">${item.profissionalNome || "-"}</div>
        </div>
      </div>

      <div style="margin-top: 8px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-avisar-retorno" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">
          Avisar cliente
        </button>

        <button class="btn-whatsapp-retorno" style="background:#16a34a;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">
          WhatsApp
        </button>
      </div>
    `;

    const btnAvisar = card.querySelector(".btn-avisar-retorno");
    btnAvisar.addEventListener("click", () => handleAvisarCliente(item, btnAvisar));

    const btnWhatsApp = card.querySelector(".btn-whatsapp-retorno");
    btnWhatsApp.addEventListener("click", () => abrirWhatsAppCliente(item));

    listaEl.appendChild(card);
  }
}

function configurarFiltros() {
  if (!filtrosEl) return;

  filtrosEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filtro]");
    if (!btn) return;

    filtroAtual = btn.dataset.filtro || "todos";

    filtrosEl.querySelectorAll(".filtro-btn").forEach((item) => {
      item.classList.remove("ativo");
    });

    btn.classList.add("ativo");
    renderizarLista();
  });
}

async function carregarTela() {
  try {
    empresaId = buscarEmpresaAtiva();

    if (!empresaId) {
      throw new Error("Nenhuma empresa ativa encontrada.");
    }

    const agendamentos = await buscarAgendamentosRealizados(empresaId);

    retornoCalculado = calcularRetornos(agendamentos);
    atualizarResumo(retornoCalculado);

    loadingEl.style.display = "none";
    renderizarLista();
  } catch (error) {
    console.error("Erro ao carregar clientes para retorno:", error);
    loadingEl.style.display = "none";
    listaEl.style.display = "none";
    vazioEl.style.display = "block";
    vazioEl.textContent = "Erro ao carregar clientes para retorno.";
    mostrarToast(error.message || "Erro ao carregar clientes para retorno.");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  configurarFiltros();
  await carregarTela();
});
