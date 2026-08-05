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
    criarMensagemLiberacaoAtendimento
} from "./atendimento-mensagens.js";

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
    "liberado",
    "retirado"
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
        botao: "🐾 CONFIRMAR RETIRADA DO PET"
    },
    retirado: {
        texto: "Pet Retirado",
        emoji: "🏁",
        botao: "ATENDIMENTO ENCERRADO"
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
        : STATUS_CONFIG[statusAtual]?.botao || "ATENDIMENTO ENCERRADO";

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

    if (!modal) {
        console.error("Modal do painel não encontrado.");
        return;
    }

    modal.addEventListener("change", (e) => {
        const inputFoto = e.target?.closest?.("#pp-input-foto-atendimento");

        if (!inputFoto) return;

        exibirPreviaFotoSelecionada(inputFoto);
    });

    modal.addEventListener("click", async (e) => {
        const btnFechar = e.target.closest("#pp-fechar-painel");
        const btnAvancar = e.target.closest("#pp-btn-avancar-status");
        const btnToggle = e.target.closest("#pp-toggle-status");
        const btnStatusManual = e.target.closest("[data-status-manual]");
        const btnSalvarObs = e.target.closest("#pp-salvar-observacao");
        const btnEnviarFoto = e.target.closest("#pp-enviar-foto");

        if (btnFechar) {
            modal.remove();
            return;
        }

        if (btnToggle) {
            const opcoesStatus = document.getElementById("pp-opcoes-status");
            opcoesStatus?.classList.toggle("oculto");
            return;
        }

        if (btnAvancar) {
            const proximoStatus = btnAvancar.dataset.proximoStatus;

            if (!proximoStatus) return;

            btnAvancar.disabled = true;
            btnAvancar.textContent = "Salvando...";

            try {
                await atualizarStatusAtendimento(
                    empresaId,
                    atendimento.id,
                    proximoStatus,
                    atendimento
                );

                await recarregarPainel(empresaId, atendimento.id);
            } catch (error) {
                console.error("Erro ao avançar status:", error);
                alert("Erro ao atualizar o status do atendimento.");

                btnAvancar.disabled = false;
                btnAvancar.textContent = "Tentar novamente";
            }

            return;
        }

        if (btnStatusManual) {
            const status = btnStatusManual.dataset.statusManual;

            if (!status) return;

            btnStatusManual.disabled = true;

            try {
                await atualizarStatusAtendimento(
                    empresaId,
                    atendimento.id,
                    status,
                    atendimento
                );

                await recarregarPainel(empresaId, atendimento.id);
            } catch (error) {
                console.error("Erro ao definir status manual:", error);
                alert("Erro ao definir status manual.");

                btnStatusManual.disabled = false;
            }

            return;
        }

        if (btnSalvarObs) {
            btnSalvarObs.disabled = true;
            btnSalvarObs.textContent = "Salvando...";

            try {
                await salvarObservacao(empresaId, atendimento.id);
                await recarregarPainel(empresaId, atendimento.id);
            } catch (error) {
                console.error("Erro ao salvar observação:", error);
                alert("Erro ao salvar observação.");

                btnSalvarObs.disabled = false;
                btnSalvarObs.textContent = "Salvar Observação";
            }

            return;
        }

        if (btnEnviarFoto) {
            btnEnviarFoto.disabled = true;
            btnEnviarFoto.textContent = "Enviando...";

            try {
                await enviarFotoAtendimento(empresaId, atendimento.id);
                await recarregarPainel(empresaId, atendimento.id);
            } catch (error) {
                console.error("Erro ao enviar foto:", error);
                alert("Erro ao enviar foto do atendimento.");

                btnEnviarFoto.disabled = false;
                btnEnviarFoto.textContent = "Enviar Foto";
            }

            return;
        }
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

    if (statusNormalizado === "liberado") {
        try {
            const resultadoMensagem = await criarMensagemLiberacaoAtendimento({
                empresaId,
                agendamentoId,
                atendimento: {
                    ...atendimentoAtual,
                    id: agendamentoId,
                    statusAtendimento: statusNormalizado
                }
            });

            window.dispatchEvent(
                new CustomEvent("pronti-liberacao-cliente-atualizada", {
                    detail: {
                        empresaId,
                        agendamentoId,
                        mensagemId: resultadoMensagem.mensagemId,
                        mensagemCriada: resultadoMensagem.criada
                    }
                })
            );
        } catch (error) {
            console.error(
                "Status liberado, mas não foi possível criar a mensagem para o cliente:",
                error
            );

            window.dispatchEvent(
                new CustomEvent("pronti-erro-mensagem-liberacao", {
                    detail: {
                        empresaId,
                        agendamentoId,
                        erro: error
                    }
                })
            );

            alert(
                "O pet foi liberado, mas o aviso ao cliente não foi criado. " +
                "Tente definir o status como Liberado novamente."
            );
        }
    }

    window.dispatchEvent(
        new CustomEvent("pronti-atendimento-atualizado", {
            detail: {
                agendamentoId,
                statusAtendimento: statusNormalizado
            }
        })
    );
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

function exibirPreviaFotoSelecionada(input) {
    const preview = document.getElementById("pp-preview-foto");
    const arquivo = input?.files?.[0];

    if (!preview) return;

    if (!arquivo) {
        preview.innerHTML = "";
        return;
    }

    if (!arquivo.type || !arquivo.type.startsWith("image/")) {
        input.value = "";
        preview.innerHTML = "";
        alert("Escolha um arquivo de imagem válido.");
        return;
    }

    const limiteBytes = 5 * 1024 * 1024;

    if (arquivo.size > limiteBytes) {
        input.value = "";
        preview.innerHTML = "";
        alert("A imagem deve ter no máximo 5 MB.");
        return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
        preview.innerHTML = `
            <div class="pp-preview-foto-card pp-preview-foto-local">
                <img
                    src="${escaparAtributo(leitor.result)}"
                    alt="Prévia da foto selecionada"
                >
                <small>
                    Prévia da foto. Clique em “Enviar Foto” para publicar para o tutor.
                </small>
            </div>
        `;
    };

    leitor.onerror = () => {
        preview.innerHTML = "";
        alert("Não foi possível gerar a prévia da imagem.");
    };

    leitor.readAsDataURL(arquivo);
}

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
            background: linear-gradient(180deg, #eef6ff 0%, #f8fbff 45%, #ffffff 100%);
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
            position: sticky;
            top: 0;
            z-index: 5;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0 14px;
            background: linear-gradient(180deg, #eef6ff 70%, rgba(238, 246, 255, 0));
            margin-bottom: 10px;
        }

        .pp-btn-fechar {
            border: none;
            background: #ffffff;
            color: #0369a1;
            border-radius: 999px;
            padding: 11px 18px;
            font-weight: 900;
            cursor: pointer;
            box-shadow: 0 8px 22px rgba(14, 165, 233, 0.18);
        }

        .pp-painel-titulo {
            font-weight: 950;
            color: #075985;
            font-size: 0.95rem;
        }

        .pp-painel-main {
            padding-bottom: 26px;
        }

        .pp-pet-card,
        .pp-status-card,
        .pp-timeline-card,
        .pp-observacao-card,
        .pp-foto-atendimento-card,
        .pp-corrigir-card {
            background: #ffffff;
            border-radius: 26px;
            padding: 18px;
            margin-bottom: 14px;
            box-shadow: 0 12px 34px rgba(15, 23, 42, 0.10);
            box-sizing: border-box;
            border: 1px solid rgba(14, 165, 233, 0.10);
        }

        .pp-pet-card {
            text-align: center;
            padding-top: 22px;
        }

        .pp-pet-foto {
            width: 178px;
            height: 178px;
            border-radius: 34px;
            margin: 0 auto 14px;
            background: linear-gradient(135deg, #dbeafe, #f0f9ff);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 4rem;
            box-shadow: 0 10px 28px rgba(14, 165, 233, 0.20);
            border: 4px solid #ffffff;
        }

        .pp-pet-foto img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pp-pet-card h1 {
            margin: 0;
            color: #0f172a;
            font-size: 2.05rem;
            font-weight: 950;
            line-height: 1.1;
        }

        .pp-pet-card p {
            margin: 7px 0 8px;
            color: #0369a1;
            font-weight: 900;
        }

        .pp-pet-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            color: #475569;
            font-size: 0.92rem;
            font-weight: 700;
        }

        .pp-status-card {
            text-align: center;
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #ffffff;
            border: none;
            box-shadow: 0 14px 34px rgba(14, 165, 233, 0.32);
        }

        .pp-status-label {
            font-size: 0.76rem;
            font-weight: 900;
            opacity: 0.92;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .pp-status-atual {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
            font-size: 1.65rem;
        }

        .pp-status-atual strong {
            font-size: 1.55rem;
            font-weight: 950;
        }

        .pp-status-card small {
            opacity: 0.95;
            font-weight: 700;
        }

        .pp-btn-principal {
            width: 100%;
            border: none;
            border-radius: 24px;
            padding: 23px 18px;
            font-size: 1.18rem;
            font-weight: 950;
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #ffffff;
            margin-bottom: 14px;
            box-shadow: 0 14px 34px rgba(14, 165, 233, 0.35);
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
            letter-spacing: 0.02em;
        }

        .pp-btn-principal:hover {
            transform: translateY(-2px);
            box-shadow: 0 18px 40px rgba(14, 165, 233, 0.42);
        }

        .pp-btn-principal:active {
            transform: scale(0.98);
        }

        .pp-btn-principal:disabled {
            background: #cbd5e1;
            color: #64748b;
            box-shadow: none;
            cursor: not-allowed;
            opacity: 0.85;
        }

        .pp-btn-secundario {
            width: 100%;
            border: none;
            border-radius: 18px;
            padding: 15px;
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #ffffff;
            font-weight: 950;
            margin-top: 10px;
            cursor: pointer;
            box-shadow: 0 10px 24px rgba(14, 165, 233, 0.28);
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }

        .pp-btn-secundario:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 30px rgba(14, 165, 233, 0.34);
        }

        .pp-btn-secundario:active {
            transform: scale(0.98);
        }

        .pp-btn-secundario:disabled {
            background: #cbd5e1;
            color: #64748b;
            cursor: not-allowed;
            box-shadow: none;
        }

        .pp-corrigir-card {
            padding: 14px;
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
            border: 1.5px solid #7dd3fc;
            background: #f0f9ff;
            color: #0369a1;
            border-radius: 18px;
            padding: 14px;
            font-weight: 900;
            text-align: left;
            cursor: pointer;
            box-shadow: 0 6px 16px rgba(14, 165, 233, 0.14);
            transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }

        .pp-btn-status-manual:hover {
            background: #e0f2fe;
            transform: translateY(-1px);
            box-shadow: 0 10px 22px rgba(14, 165, 233, 0.22);
        }

        .pp-btn-status-manual.ativo {
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #ffffff;
            border-color: transparent;
            box-shadow: 0 10px 24px rgba(14, 165, 233, 0.32);
        }

        .pp-timeline-card h2,
        .pp-observacao-card h2,
        .pp-foto-atendimento-card h2 {
            margin: 0 0 12px;
            color: #0f172a;
            font-size: 1.08rem;
            font-weight: 950;
        }

        .pp-timeline-lista {
            display: grid;
            gap: 12px;
        }

        .pp-timeline-item {
            display: flex;
            gap: 12px;
            align-items: center;
            padding: 8px 6px;
            border-radius: 14px;
        }

        .pp-timeline-marcador {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 950;
            flex-shrink: 0;
        }

        .pp-timeline-item.concluido .pp-timeline-marcador {
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #ffffff;
            box-shadow: 0 8px 18px rgba(14, 165, 233, 0.28);
        }

        .pp-timeline-item.pendente .pp-timeline-marcador {
            background: #e2e8f0;
            color: #64748b;
        }

        .pp-timeline-item strong {
            color: #0f172a;
            display: block;
            font-weight: 900;
        }

        .pp-timeline-item small {
            color: #64748b;
            font-size: 0.78rem;
            font-weight: 700;
        }

        .pp-observacao-card textarea {
            width: 100%;
            min-height: 120px;
            border: 1.5px solid #bae6fd;
            border-radius: 18px;
            padding: 14px;
            font-size: 1rem;
            resize: vertical;
            box-sizing: border-box;
            outline: none;
            color: #0f172a;
            background: #ffffff;
        }

        .pp-observacao-card textarea:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.18);
        }

        .pp-foto-atendimento-card p {
            color: #475569;
            margin-top: 0;
            font-weight: 700;
        }

        .pp-foto-atendimento-card input {
            width: 100%;
            padding: 14px;
            border: 1.5px dashed #38bdf8;
            border-radius: 18px;
            box-sizing: border-box;
            background: #f0f9ff;
            color: #0369a1;
            font-weight: 800;
            cursor: pointer;
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
            box-shadow: 0 10px 26px rgba(15, 23, 42, 0.12);
        }

        .pp-preview-foto-card small {
            display: block;
            margin-top: 8px;
            color: #475569;
            font-weight: 700;
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

            .pp-status-atual strong {
                font-size: 1.28rem;
            }

            .pp-btn-principal {
                font-size: 1.05rem;
                padding: 22px 14px;
            }
        }
    `;

    document.head.appendChild(style);
}
