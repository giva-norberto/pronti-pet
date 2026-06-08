// ======================================================================
//          DASHBOARD.JS (FINAL, CORRIGIDO E ALINHADO AO MÊS ATUAL - COM DEBUGS)
// =====================================================================

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { gerarResumoDiarioInteligente } from "./inteligencia.js";

// --- VARIÁVEIS GLOBAIS E CONSTANTES ---
let servicosChart;
const STATUS_VALIDOS = ["ativo", "realizado"];

// --- FUNÇÕES DE UTILIDADE ---
function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

function resetDashboardUI() {
    console.log("[DEBUG] Resetando a UI do Dashboard para estado de carregamento.");
    const spinner = '<span class="loading-spinner"></span>';
    
    document.getElementById('faturamento-realizado').innerHTML = spinner;
    document.getElementById('faturamento-previsto').textContent = '--';
    document.getElementById('total-agendamentos-dia').innerHTML = spinner;
    document.getElementById('agendamentos-pendentes').textContent = '--';
    document.getElementById('resumo-inteligente').innerHTML = spinner;
    
    const fatMensalEl = document.getElementById('faturamento-mensal');
    const agMesEl = document.getElementById('agendamentos-mes');
    if (fatMensalEl) fatMensalEl.innerHTML = spinner;
    if (agMesEl) agMesEl.textContent = '--';

    if (servicosChart) {
        servicosChart.destroy();
        servicosChart = null;
    }
    const graficoContainer = document.getElementById('grafico-container');
    if (graficoContainer && !graficoContainer.querySelector('.loading-spinner')) {
        graficoContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; min-height:320px;"><span class="loading-spinner"></span></div>';
    }
}

function preencherPainel(resumoDia, resumoMes, servicosContagem) {
    console.log("[DEBUG] preenchendo painel", {resumoDia, resumoMes, servicosContagem});
    document.getElementById('faturamento-realizado').textContent = resumoDia.faturamentoRealizado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    document.getElementById('faturamento-previsto').textContent = resumoDia.faturamentoPrevisto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    document.getElementById('total-agendamentos-dia').textContent = resumoDia.totalAgendamentosDia;
    document.getElementById('agendamentos-pendentes').textContent = resumoDia.agendamentosPendentes;

    const fatMensalEl = document.getElementById('faturamento-mensal');
    const agMesEl = document.getElementById('agendamentos-mes');
    if (fatMensalEl) fatMensalEl.textContent = resumoMes.faturamentoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (agMesEl) agMesEl.textContent = resumoMes.agendamentosMes;

    if (resumoDia.agsParaIA && resumoDia.agsParaIA.length > 0) {
        const resumoInteligente = gerarResumoDiarioInteligente(resumoDia.agsParaIA);
        document.getElementById('resumo-inteligente').innerHTML = resumoInteligente?.mensagem || "<ul><li>Não foi possível gerar o resumo.</li></ul>";
    } else {
        document.getElementById('resumo-inteligente').innerHTML = "<ul><li>Nenhum agendamento no dia para resumir.</li></ul>";
    }

    const graficoContainer = document.getElementById('grafico-container');
    graficoContainer.innerHTML = '<canvas id="servicos-mais-vendidos"></canvas>';
    const ctx = document.getElementById('servicos-mais-vendidos').getContext('2d');
    
    if (servicosChart) servicosChart.destroy();

    const servicosArray = Object.entries(servicosContagem).sort((a, b) => b[1] - a[1]);
    servicosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: servicosArray.map(([nome]) => nome),
            datasets: [{
                label: 'Mais vendidos no mês',
                data: servicosArray.map(([_, qtd]) => qtd),
                backgroundColor: '#6366f1',
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// --- FUNÇÕES DE BUSCA DE DADOS ---

async function buscarDadosDoDia(empresaId, data) {
    const agRef = collection(db, "empresarios", empresaId, "agendamentos");
    const q = query(agRef, where("data", "==", data), where("status", "in", STATUS_VALIDOS));
    const snapshot = await getDocs(q);

    console.log("[DEBUG] buscarDadosDoDia:", { empresaId, data, qtdDocs: snapshot.size });

    let faturamentoRealizado = 0, faturamentoPrevisto = 0, totalAgendamentosDia = 0, agendamentosPendentes = 0;
    const agsParaIA = [];
    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    snapshot.forEach(doc => {
        const ag = doc.data();
        console.log("[DEBUG] agendamento DIA:", doc.id, ag);

        totalAgendamentosDia++;
        faturamentoPrevisto += Number(ag.servicoPrecoCobrado) || 0;
        if (ag.status === "realizado") {
            faturamentoRealizado += Number(ag.servicoPrecoCobrado) || 0;
        } else if (ag.status === "ativo") {
            const minutosAg = timeStringToMinutes(ag.horario);
            if (minutosAg >= minutosAgora) {
                agendamentosPendentes++;
            }
        }
        agsParaIA.push({
            inicio: `${ag.data}T${ag.horario}:00`,
            cliente: ag.clienteNome,
            servico: ag.servicoNome,
            servicoPreco: Number(ag.servicoPrecoCobrado) || 0,
            status: ag.status
        });
    });

    console.log("[DEBUG] resultado buscarDadosDoDia:", { faturamentoRealizado, faturamentoPrevisto, totalAgendamentosDia, agendamentosPendentes, agsParaIA });

    return { faturamentoRealizado, faturamentoPrevisto, totalAgendamentosDia, agendamentosPendentes, agsParaIA };
}

async function buscarDadosDoMes(empresaId) {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const dataISOInicio = primeiroDia.toISOString().split("T")[0];
    const dataISOFim = ultimoDia.toISOString().split("T")[0];

    const agRef = collection(db, "empresarios", empresaId, "agendamentos");
    const q = query(agRef, where("data", ">=", dataISOInicio), where("data", "<=", dataISOFim), where("status", "==", "realizado"));
    const snapshot = await getDocs(q);

    console.log("[DEBUG] buscarDadosDoMes:", { empresaId, dataISOInicio, dataISOFim, qtdDocs: snapshot.size });

    let faturamentoMensal = 0;
    let servicosContagem = {};
    snapshot.forEach(doc => {
        const ag = doc.data();
        console.log("[DEBUG] agendamento MES:", doc.id, ag);

        faturamentoMensal += Number(ag.servicoPrecoCobrado) || 0;
        const nome = ag.servicoNome || "Serviço";
        servicosContagem[nome] = (servicosContagem[nome] || 0) + 1;
    });

    console.log("[DEBUG] resultado buscarDadosDoMes:", { faturamentoMensal, agendamentosMes: snapshot.size, servicosContagem });

    return { faturamentoMensal, agendamentosMes: snapshot.size, servicosContagem };
}

// --- FUNÇÃO PRINCIPAL DE ORQUESTRAÇÃO ---

async function carregarDashboard(empresaId, data) {
    console.log(`[DEBUG] Carregando dashboard para empresa ${empresaId} na data ${data}`);
    resetDashboardUI();

    try {
        const [resumoDoDia, resumoDoMes] = await Promise.all([
            buscarDadosDoDia(empresaId, data),
            buscarDadosDoMes(empresaId)
        ]);

        preencherPainel(resumoDoDia, resumoDoMes, resumoDoMes.servicosContagem); // <- corrigido aqui

        console.log("[DEBUG] painel preenchido");
    } catch (error) {
        console.error("[DEBUG] Erro ao carregar dados do dashboard:", error);
        document.getElementById('resumo-inteligente').innerHTML = "<p style='color: red;'>Erro ao carregar dados.</p>";
    }
}

// ==================================================================
// ✅ INÍCIO DA CORREÇÃO DEFINITIVA
// ==================================================================
/**
 * Ponto de entrada do dashboard, EXPORTADO para ser chamado pelo HTML.
 * @param {object} sessao - O objeto de sessão do usuário vindo do verificarAcesso.
 */

export async function inicializarDashboard(sessao) {
    try {
        const empresaId = sessao.empresaId;
        const filtroDataEl = document.getElementById('filtro-data');

        filtroDataEl.value = new Date().toISOString().split('T')[0];

        console.log("[DEBUG] inicializarDashboard, empresaId:", empresaId, "data:", filtroDataEl.value);

        await carregarDashboard(empresaId, filtroDataEl.value);

        filtroDataEl.addEventListener('change', debounce(() => {
            console.log("[DEBUG] filtroDataEl change, novo valor:", filtroDataEl.value);
            carregarDashboard(empresaId, filtroDataEl.value);
        }, 300));

        window.addEventListener('empresaAtivaTroca', () => {
            location.reload();
        });

    } catch (error) {
        console.error("[DEBUG] Falha na inicialização do dashboard:", error);
        const mainContent = document.querySelector('.dashboard-main');
        if (mainContent) {
            mainContent.innerHTML = '<p class="erro">Falha ao carregar os componentes do dashboard.</p>';
        }
    }
}

// Se o dashboard é inicializado automaticamente via script externo:
// Aguarde o DOM estar pronto e chame a inicialização apenas depois
window.addEventListener("DOMContentLoaded", async () => {
    // Aqui é necessário obter o objeto sessao e inicializar só após
    // Exemplo fictício, adapte conforme seu fluxo de autenticação.
    const sessao = await obterSessao(); // troque para sua função real!
    console.log("[DEBUG] Obteve sessão:", sessao);
    if (sessao) {
        await inicializarDashboard(sessao);
    }
});

// ==================================================================
// ✅ FIM DA CORREÇÃO DEFINITIVA
// ==================================================================
