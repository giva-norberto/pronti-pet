/*
=========================================================
 PRONTI PET — painel-atendimento.js
=========================================================

Painel operacional do Pet Shop.

Função:
- Abrir painel full screen ao clicar no card da agenda
- Mostrar foto do pet
- Mostrar dados do atendimento
- Alterar status diretamente no Firestore
- Usar botão único inteligente
- Gerar timeline automática
- Salvar observação da equipe
- Enviar foto do atendimento
- Deixar foto disponível para o tutor por 24 horas

Fluxo padrão:
Aguardando Atendimento
↓
Em Atendimento
↓
Finalizado
↓
Liberado para Retirada

=========================================================
*/

import { db, storage } from "./firebase-config.js";

import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const STATUS_FLUXO_PADRAO = [
    "aguardando",
    "em_atendimento",
    "finalizado",
    "liberado"
];

const STATUS_CONFIG = {
    aguardando: {
        texto: "Aguardando Atendimento",
        emoji: "⏳",
        botao: "▶️ INICIAR ATENDIMENTO"
    },
    em_atendimento: {
        texto: "Em Atendimento",
        emoji: "🔵",
        botao: "✅ FINALIZAR ATENDIMENTO"
    },
    finalizado: {
        texto: "Finalizado",
        emoji: "🟢",
        botao: "🚪 LIBERAR PET"
    },
    liberado: {
        texto: "Liberado para Retirada",
        emoji: "✅",
        botao: "ATENDIMENTO CONCLUÍDO"
    }
};

/* =====================================================
   ABRIR PAINEL
===================================================== */

export async function abrirPainelAtendimento(empresaId, agendamentoId) {
    if (!empresaId || !agendamentoId) {
        alert("Não foi possível abrir o atendimento.");
        return;
    }

    aplicarCssPainelAtendimento();

    const atendimentoRef = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId
    );

    const snap = await getDoc(atendimentoRef);

    if (!snap.exists()) {
        alert("Atendimento não encontrado.");
        return;
    }

    const atendimento = {
        id: snap.id,
        ...snap.data()
    };

    criarModalPainel(empresaId, atendimento);
}

/* =====================================================
   MODAL FULL SCREEN
===================================================== */

function criarModalPainel(empresaId, atendimento) {
    removerPainelExistente();

    const modal = document.createElement("div");
    modal.id = "pp-painel-atendimento-modal";
    modal.className = "pp-painel-modal";

    modal.innerHTML = montarHtmlPainel(atendimento);

    document.body.appendChild(modal);

    configurarEventosPainel(empresaId, atendimento);
}

function removerPainelExistente() {
    const existente = document.getElementById("pp-painel-atendimento-modal");

    if (existente) {
        existente.remove();
    }
}

/* =====================================================
   HTML DO PAINEL
===================================================== */

function montarHtmlPainel(atendimento) {
    const statusAtual = normalizarStatus(
        atendimento.statusAtendimento || "aguardando"
    );

    const statusInfo = STATUS_CONFIG[statusAtual] || STATUS_CONFIG.aguardando;

    const proximoStatus = obterProximoStatus(
        statusAtual,
        obterFluxoAtendimento(atendimento)
    );

    const textoBotao = proximoStatus
        ? STATUS_CONFIG[statusAtual]?.botao || "AVANÇAR"
        : "ATENDIMENTO CONCLUÍDO";

    const nomePet =
        atendimento.petNome ||
        atendimento.nomePet ||
        atendimento.nomeAnimal ||
        atendimento.pet?.nome ||
        "Pet";

    const fotoPet =
        atendimento.petFotoUrl ||
        atendimento.fotoPetUrl ||
        atendimento.pet?.fotoUrl ||
        atendimento.fotoAnimal ||
        "";

    const tutor =
        atendimento.clienteNome ||
        atendimento.nomeCliente ||
        atendimento.tutorNome ||
        atendimento.cliente?.nome ||
        "Tutor";

    const servico =
        atendimento.servicoNome ||
        atendimento.nomeServico ||
        atendimento.servico ||
        atendimento.tipoServico ||
        "Serviço";

    const horario =
        atendimento.hora ||
        atendimento.horario ||
        atendimento.dataHora ||
        "";

    const observacao =
        atendimento.observacaoEquipe ||
        atendimento.observacaoAtendimento ||
        "";

    return `
        <div class="pp-painel-conteudo">

            <header class="pp-painel-topo">
                <button id="pp-fechar-painel" class="pp-btn-fechar">
                    ✕ Fechar
                </button>

                <span class="pp-painel-titulo">
                    🐾 Atendimento
                </span>
            </header>

            <main class="pp-painel-main">

                <section class="pp-pet-card">
                    <div class="pp-pet-foto">
                        ${
                            fotoPet
                                ? `<img src="${escaparAtributo(fotoPet)}" alt="Foto do pet">`
                                : `<span>🐾</span>`
                        }
                    </div>

                    <h1>${escaparHtml(nomePet)}</h1>

                    <p>${escaparHtml(servico)}</p>

                    <div class="pp-pet-info">
                        <span>Tutor: ${escaparHtml(tutor)}</span>
                        ${horario ? `<span>Horário: ${escaparHtml(formatarHorarioTexto(horario))}</span>` : ""}
                    </div>
                </section>

                <section class="pp-status-card">
                    <span class="pp-status-label">Status atual</span>

                    <div class="pp-status-atual">
                        <span>${statusInfo.emoji}</span>
                        <strong>${statusInfo.texto}</strong>
                    </div>

                    <small>
                        Última atualização:
                        ${formatarDataHora(atendimento.ultimaAtualizacaoStatus)}
                    </small>
                </section>

                <button
                    id="pp-btn-avancar-status"
                    class="pp-btn-principal"
                    ${!proximoStatus ? "disabled" : ""}
                    data-proximo-status="${proximoStatus || ""}"
                >
                    ${textoBotao}
                </button>

                <section class="pp-corrigir-card">
                    <button id="pp-toggle-status" class="pp-btn-secundario">
                        ⚙️ Definir status manualmente
                    </button>

                    <div id="pp-opcoes-status" class="pp-opcoes-status oculto">
                        ${montarBotoesStatusManuais(atendimento)}
                    </div>
                </section>

                <section class="pp-timeline-card">
                    <h2>📊 Linha do Tempo</h2>
                    ${montarTimeline(atendimento)}
                </section>

                <section class="pp-observacao-card">
                    <h2>💬 Observação da Equipe</h2>

                    <textarea
                        id="pp-observacao-equipe"
                        placeholder="Exemplo: Thor ficou tranquilo durante o atendimento."
                    >${escaparHtml(observacao)}</textarea>

                    <button id="pp-salvar-observacao" class="pp-btn-secundario">
                        Salvar Observação
                    </button>
                </section>

                <section class="pp-foto-atendimento-card">
                    <h2>📸 Foto do Atendimento</h2>

                    <p>
                        A foto ficará disponível para o tutor por 24 horas.
                    </p>

                    <input
                        id="pp-input-foto-atendimento"
                        type="file"
                        accept="image/*"
                        capture="environment"
                    >

                    <button id="pp-enviar-foto" class="pp-btn-secundario">
                        Enviar Foto
                    </button>

                    <div id="pp-preview-foto">
                        ${montarPreviewFoto(atendimento)}
                    </div>
                </section>

            </main>

        </div>
    `;
}

function montarBotoesStatusManuais(atendimento) {
    const fluxo = obterFluxoAtendimento(atendimento);
    const statusAtual = normalizarStatus(atendimento.statusAtendimento || "aguardando");

    return fluxo.map((status) => {
        const config = STATUS_CONFIG[status];
        const ativo = status === statusAtual;

        return `
            <button
                class="pp-btn-status-manual ${ativo ? "ativo" : ""}"
                data-status-manual="${status}"
            >
                ${config.emoji} ${config.texto}
            </button>
        `;
    }).join("");
}

function montarTimeline(atendimento) {
    const fluxo = obterFluxoAtendimento(atendimento);
    const statusAtual = normalizarStatus(atendimento.statusAtendimento || "aguardando");
    const indiceAtual = fluxo.indexOf(statusAtual);
    const timeline = Array.isArray(atendimento.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    return `
        <div class="pp-timeline-lista">
            ${fluxo.map((status, index) => {
                const config = STATUS_CONFIG[status];
                const concluido = indiceAtual >= 0 && index <= indiceAtual;
                const dataStatus = buscarDataTimeline(status, timeline);

                return `
                    <div class="pp-timeline-item ${concluido ? "concluido" : "pendente"}">
                        <div class="pp-timeline-marcador">
                            ${concluido ? "✓" : "○"}
                        </div>

                        <div>
                            <strong>${config.texto}</strong>
                            ${dataStatus ? `<small>${formatarHorario(dataStatus)}</small>` : ""}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function montarPreviewFoto(atendimento) {
    const fotoUrl =
        atendimento.fotoAtendimentoUrl ||
        atendimento.fotoUrl ||
        atendimento.fotoFinalizacaoUrl ||
        "";

    if (!fotoUrl) {
        return "";
    }

    return `
        <div class="pp-preview-foto-card">
            <img src="${escaparAtributo(fotoUrl)}" alt="Foto do atendimento">
            <small>Foto já enviada para o tutor.</small>
        </div>
    `;
}

/* =====================================================
   EVENTOS
===================================================== */

function configurarEventosPainel(empresaId, atendimento) {
    const modal = document.getElementById("pp-painel-atendimento-modal");

    const btnFechar = document.getElementById("pp-fechar-painel");
    const btnAvancar = document.getElementById("pp-btn-avancar-status");
    const btnToggle = document.getElementById("pp-toggle-status");
    const opcoesStatus = document.getElementById("pp-opcoes-status");
    const btnSalvarObs = document.getElementById("pp-salvar-observacao");
    const btnEnviarFoto = document.getElementById("pp-enviar-foto");

    btnFechar?.addEventListener("click", () => {
        modal?.remove();
    });

    btnAvancar?.addEventListener("click", async () => {
        const proximoStatus = btnAvancar.dataset.proximoStatus;

        if (!proximoStatus) return;

        await atualizarStatusAtendimento(
            empresaId,
            atendimento.id,
            proximoStatus,
            atendimento
        );

        await recarregarPainel(empresaId, atendimento.id);
    });

    btnToggle?.addEventListener("click", () => {
        opcoesStatus?.classList.toggle("oculto");
    });

    document.querySelectorAll("[data-status-manual]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const status = btn.dataset.statusManual;

            await atualizarStatusAtendimento(
                empresaId,
                atendimento.id,
                status,
                atendimento
            );

            await recarregarPainel(empresaId, atendimento.id);
        });
    });

    btnSalvarObs?.addEventListener("click", async () => {
        await salvarObservacao(empresaId, atendimento.id);
        await recarregarPainel(empresaId, atendimento.id);
    });

    btnEnviarFoto?.addEventListener("click", async () => {
        await enviarFotoAtendimento(empresaId, atendimento.id);
        await recarregarPainel(empresaId, atendimento.id);
    });
}

async function recarregarPainel(empresaId, agendamentoId) {
    const refAtendimento = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId
    );

    const snap = await getDoc(refAtendimento);

    if (!snap.exists()) return;

    criarModalPainel(empresaId, {
        id: snap.id,
        ...snap.data()
    });
}

/* =====================================================
   STATUS E TIMELINE AUTOMÁTICA
===================================================== */

async function atualizarStatusAtendimento(
    empresaId,
    agendamentoId,
    novoStatus,
    atendimentoAtual
) {
    const statusNormalizado = normalizarStatus(novoStatus);
    const fluxo = obterFluxoAtendimento(atendimentoAtual);
    const indiceNovo = fluxo.indexOf(statusNormalizado);

    if (indiceNovo === -1) {
        alert("Status inválido para este atendimento.");
        return;
    }

    const agora = Timestamp.now();

    const timelineAtual = Array.isArray(atendimentoAtual.timelineAtendimento)
        ? atendimentoAtual.timelineAtendimento
        : [];

    const novaTimeline = montarTimelineAutomatica(
        fluxo,
        indiceNovo,
        timelineAtual,
        agora
    );

    const refAtendimento = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId
    );

    await updateDoc(refAtendimento, {
        statusAtendimento: statusNormalizado,
        ultimaAtualizacaoStatus: serverTimestamp(),
        timelineAtendimento: novaTimeline
    });
}

function montarTimelineAutomatica(
    fluxo,
    indiceNovo,
    timelineAtual,
    agora
) {
    const timelineMap = new Map();

    timelineAtual.forEach((item) => {
        const status = normalizarStatus(item?.status);

        if (status) {
            timelineMap.set(status, item);
        }
    });

    fluxo.forEach((status, index) => {
        if (index <= indiceNovo && !timelineMap.has(status)) {
            timelineMap.set(status, {
                status,
                dataHora: agora
            });
        }
    });

    return fluxo
        .filter((status) => timelineMap.has(status))
        .map((status) => timelineMap.get(status));
}

/* =====================================================
   OBSERVAÇÃO
===================================================== */

async function salvarObservacao(empresaId, agendamentoId) {
    const textarea = document.getElementById("pp-observacao-equipe");

    const observacao = textarea?.value?.trim() || "";

    const refAtendimento = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId
    );

    await updateDoc(refAtendimento, {
        observacaoEquipe: observacao,
        ultimaAtualizacaoObservacao: serverTimestamp()
    });
}

/* =====================================================
   FOTO DO ATENDIMENTO
===================================================== */

async function enviarFotoAtendimento(empresaId, agendamentoId) {
    const input = document.getElementById("pp-input-foto-atendimento");

    const arquivo = input?.files?.[0];

    if (!arquivo) {
        alert("Escolha uma foto primeiro.");
        return;
    }

    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

    const caminho = `empresarios/${empresaId}/atendimentos/${agendamentoId}/foto-atendimento-${Date.now()}.jpg`;

    const storageRef = ref(storage, caminho);

    await uploadBytes(storageRef, arquivo);

    const url = await getDownloadURL(storageRef);

    const refAtendimento = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId
    );

    await updateDoc(refAtendimento, {
        fotoAtendimentoUrl: url,
        fotoAtendimentoPath: caminho,
        fotoAtendimentoCriadaEm: Timestamp.fromDate(agora),
        fotoAtendimentoExpiraEm: Timestamp.fromDate(expiraEm)
    });
}

/* =====================================================
   FLUXO CONFIGURÁVEL
===================================================== */

function obterFluxoAtendimento(atendimento) {
    const fluxo =
        atendimento.fluxoAtendimento ||
        atendimento.etapasAtendimento ||
        atendimento.statusPermitidos;

    if (Array.isArray(fluxo) && fluxo.length > 0) {
        return fluxo
            .map((status) => normalizarStatus(status))
            .filter((status) => STATUS_CONFIG[status]);
    }

    return STATUS_FLUXO_PADRAO;
}

function obterProximoStatus(statusAtual, fluxo) {
    const indiceAtual = fluxo.indexOf(statusAtual);

    if (indiceAtual === -1) {
        return fluxo[0] || "aguardando";
    }

    return fluxo[indiceAtual + 1] || null;
}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function normalizarStatus(status) {
    if (!status) return "";

    return String(status)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");
}

function buscarDataTimeline(status, timeline) {
    const item = timeline.find((etapa) => {
        return normalizarStatus(etapa?.status) === status;
    });

    return item?.dataHora || item?.criadoEm || item?.createdAt || null;
}

function converterParaDate(valor) {
    if (!valor) return null;

    if (valor instanceof Date) return valor;

    if (valor instanceof Timestamp) return valor.toDate();

    if (typeof valor?.toDate === "function") return valor.toDate();

    if (typeof valor === "string" || typeof valor === "number") {
        const data = new Date(valor);
        return isNaN(data.getTime()) ? null : data;
    }

    return null;
}

function formatarDataHora(valor) {
    const data = converterParaDate(valor);

    if (!data) return "agora";

    return data.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatarHorario(valor) {
    const data = converterParaDate(valor);

    if (!data) return "";

    return data.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatarHorarioTexto(valor) {
    const data = converterParaDate(valor);

    if (data) {
        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    return String(valor);
}

function escaparHtml(texto) {
    return String(texto)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escaparAtributo(texto) {
    return escaparHtml(texto);
}

/* =====================================================
   CSS DO PAINEL
===================================================== */

function aplicarCssPainelAtendimento() {
    if (document.getElementById("pp-painel-atendimento-css")) return;

    const style = document.createElement("style");
    style.id = "pp-painel-atendimento-css";

    style.textContent = `
        .pp-painel-modal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: linear-gradient(180deg, #f7f0ff, #ffffff);
            overflow-y: auto;
            font-family: inherit;
        }

        .pp-painel-conteudo {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            min-height: 100vh;
            padding: 18px;
            box-sizing: border-box;
        }

        .pp-painel-topo {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 18px;
        }

        .pp-btn-fechar {
            border: none;
            background: #ffffff;
            color: #4c1d95;
            border-radius: 999px;
            padding: 12px 18px;
            font-weight: 800;
            box-shadow: 0 8px 24px rgba(76, 29, 149, 0.14);
        }

        .pp-painel-titulo {
            font-weight: 900;
            color: #4c1d95;
        }

        .pp-pet-card,
        .pp-status-card,
        .pp-timeline-card,
        .pp-observacao-card,
        .pp-foto-atendimento-card,
        .pp-corrigir-card {
            background: #ffffff;
            border-radius: 28px;
            padding: 18px;
            margin-bottom: 16px;
            box-shadow: 0 12px 36px rgba(76, 29, 149, 0.12);
            box-sizing: border-box;
        }

        .pp-pet-card {
            text-align: center;
        }

        .pp-pet-foto {
            width: 180px;
            height: 180px;
            border-radius: 34px;
            margin: 0 auto 14px;
            background: #f1e9ff;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 4rem;
        }

        .pp-pet-foto img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pp-pet-card h1 {
            margin: 0;
            color: #2b164c;
            font-size: 2rem;
        }

        .pp-pet-card p {
            margin: 6px 0 10px;
            color: #6b6475;
            font-weight: 700;
        }

        .pp-pet-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            color: #6b6475;
            font-size: 0.95rem;
        }

        .pp-status-card {
            text-align: center;
            background: linear-gradient(135deg, #6d28d9, #9333ea);
            color: #ffffff;
        }

        .pp-status-label {
            font-size: 0.8rem;
            font-weight: 700;
            opacity: 0.9;
        }

        .pp-status-atual {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
            font-size: 1.8rem;
        }

        .pp-status-atual strong {
            font-size: 1.6rem;
        }

        .pp-status-card small {
            opacity: 0.9;
        }

        .pp-btn-principal {
            width: 100%;
            border: none;
            border-radius: 26px;
            padding: 24px 18px;
            font-size: 1.25rem;
            font-weight: 900;
            background: #4c1d95;
            color: #ffffff;
            margin-bottom: 16px;
            box-shadow: 0 14px 34px rgba(76, 29, 149, 0.28);
        }

        .pp-btn-principal:disabled {
            background: #c4b5fd;
            box-shadow: none;
        }

        .pp-btn-secundario {
            width: 100%;
            border: none;
            border-radius: 18px;
            padding: 15px;
            background: #f1e9ff;
            color: #4c1d95;
            font-weight: 900;
            margin-top: 10px;
        }

        .pp-opcoes-status {
            display: grid;
            gap: 10px;
            margin-top: 12px;
        }

        .pp-opcoes-status.oculto {
            display: none;
        }

        .pp-btn-status-manual {
            border: 1px solid #e9d5ff;
            background: #ffffff;
            color: #4c1d95;
            border-radius: 18px;
            padding: 14px;
            font-weight: 800;
            text-align: left;
        }

        .pp-btn-status-manual.ativo {
            background: #6d28d9;
            color: #ffffff;
        }

        .pp-timeline-card h2,
        .pp-observacao-card h2,
        .pp-foto-atendimento-card h2 {
            margin: 0 0 12px;
            color: #2b164c;
            font-size: 1.1rem;
        }

        .pp-timeline-lista {
            display: grid;
            gap: 10px;
        }

        .pp-timeline-item {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .pp-timeline-marcador {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
        }

        .pp-timeline-item.concluido .pp-timeline-marcador {
            background: #6d28d9;
            color: #ffffff;
        }

        .pp-timeline-item.pendente .pp-timeline-marcador {
            background: #eee7f8;
            color: #8b7ca8;
        }

        .pp-timeline-item strong {
            color: #2b164c;
            display: block;
        }

        .pp-timeline-item small {
            color: #7c738d;
            font-size: 0.78rem;
        }

        .pp-observacao-card textarea {
            width: 100%;
            min-height: 120px;
            border: 1px solid #e9d5ff;
            border-radius: 18px;
            padding: 14px;
            font-size: 1rem;
            resize: vertical;
            box-sizing: border-box;
            outline: none;
        }

        .pp-foto-atendimento-card p {
            color: #6b6475;
            margin-top: 0;
        }

        .pp-foto-atendimento-card input {
            width: 100%;
            padding: 14px;
            border: 1px dashed #c4b5fd;
            border-radius: 18px;
            box-sizing: border-box;
            background: #faf7ff;
        }

        .pp-preview-foto-card {
            margin-top: 14px;
            text-align: center;
        }

        .pp-preview-foto-card img {
            width: 100%;
            max-height: 360px;
            object-fit: cover;
            border-radius: 20px;
        }

        .pp-preview-foto-card small {
            display: block;
            margin-top: 8px;
            color: #6b6475;
        }

        @media (max-width: 600px) {
            .pp-painel-conteudo {
                padding: 14px;
            }

            .pp-pet-foto {
                width: 150px;
                height: 150px;
                border-radius: 30px;
            }

            .pp-pet-card h1 {
                font-size: 1.7rem;
            }

            .pp-btn-principal {
                font-size: 1.05rem;
                padding: 22px 14px;
            }
        }
    `;

    document.head.appendChild(style);
}
