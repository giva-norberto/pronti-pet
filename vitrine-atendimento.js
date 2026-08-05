// ============================================================================
//  VITRINE-ATENDIMENTO.JS — PRONTI PET
// ============================================================================
//  Leitura em tempo real dos atendimentos na vitrine do cliente.
//
//  Regras:
//  - A vitrine não altera dados no Firestore.
//  - O painel do dono permanece intacto.
//  - Cada atendimento é identificado pelo próprio agendamentoId.
//  - Um cliente pode acompanhar dois ou mais pets simultaneamente.
//  - Cada documento ativo possui seu próprio onSnapshot().
//  - O card usa exatamente o snapshot em tempo real do mesmo documento.
//  - O modal detalhado permanece desativado para evitar uma tela redundante.
//  - statusAtendimento ausente é interpretado como "aguardando",
//    seguindo a mesma regra visual utilizada pelo painel do dono.
//  - Atendimentos retirados, cancelados, faltas e documentos antigos
//    não aparecem na área de acompanhamento.
// ============================================================================

import { db } from "./vitrini-firebase.js";

import {
    collection,
    doc,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const CONTAINER_ID = "atendimento-em-andamento-container";
const MODAL_ID = "vitrine-atendimento-modal";
const MODAL_DETALHES_HABILITADO = false;

const STATUS_FLUXO_PADRAO = [
    "aguardando",
    "em_atendimento",
    "finalizado",
    "liberado",
    "retirado"
];

const STATUS_VISIVEIS = new Set([
    "aguardando",
    "em_atendimento",
    "finalizado",
    "liberado"
]);

const STATUS_AGENDAMENTO_OCULTOS = new Set([
    "cancelado",
    "cancelado_pelo_cliente",
    "cancelado_pelo_profissional",
    "cancelado_pelo_gestor",
    "nao_compareceu",
    "falta"
]);

const STATUS_CONFIG = {
    aguardando: {
        texto: "Aguardando Atendimento",
        textoCurto: "Aguardando",
        etiqueta: "Aguardando início",
        icone: "fa-clock",
        classe: "aguardando"
    },
    em_atendimento: {
        texto: "Em Atendimento",
        textoCurto: "Em atendimento",
        etiqueta: "Atendimento em andamento",
        icone: "fa-paw",
        classe: "em-atendimento"
    },
    finalizado: {
        texto: "Finalizado",
        textoCurto: "Finalizado",
        etiqueta: "Atendimento finalizado",
        icone: "fa-circle-check",
        classe: "finalizado"
    },
    liberado: {
        texto: "Liberado para Retirada",
        textoCurto: "Liberado",
        etiqueta: "Pet liberado para retirada",
        icone: "fa-house-circle-check",
        classe: "liberado"
    },
    retirado: {
        texto: "Pet Retirado",
        textoCurto: "Retirado",
        etiqueta: "Atendimento encerrado",
        icone: "fa-flag-checkered",
        classe: "retirado"
    }
};

let cicloAtual = 0;
let contextoAtual = null;
let canceladoresDescoberta = [];
let resultadosDescoberta = new Map();
let chavesDescobertaPendentes = new Set();

// Um listener e um snapshot independente para cada agendamentoId.
const canceladoresPorAtendimento = new Map();
const atendimentosAtivos = new Map();

// Guarda qual atendimento está aberto no modal.
let modalAgendamentoId = null;

// ============================================================================
//  API PÚBLICA
// ============================================================================

export function iniciarAcompanhamentoVitrine({
    empresaId,
    clienteId,
    currentUser
} = {}) {
    encerrarAcompanhamentoVitrine();

    const container = document.getElementById(CONTAINER_ID);
    const authUid = limparTexto(currentUser?.uid);
    const clienteResolvido = limparTexto(clienteId);
    const empresaResolvida = limparTexto(empresaId);

    if (!container) {
        console.warn(`[Pronti Pet] Container #${CONTAINER_ID} não encontrado.`);
        return null;
    }

    configurarEventoContainer(container);
    esconderAtendimentos(container);

    if (!empresaResolvida || (!clienteResolvido && !authUid)) {
        return null;
    }

    cicloAtual += 1;
    const ciclo = cicloAtual;

    contextoAtual = {
        empresaId: empresaResolvida,
        clienteId: clienteResolvido,
        authUid,
        ciclo
    };

    iniciarDescobertaAtendimentos(contextoAtual);

    return () => encerrarAcompanhamentoVitrine();
}

export function encerrarAcompanhamentoVitrine() {
    cicloAtual += 1;
    contextoAtual = null;
    resultadosDescoberta = new Map();
    chavesDescobertaPendentes = new Set();

    cancelarDescoberta();
    cancelarTodosAtendimentos();
    atendimentosAtivos.clear();
    removerModalDetalhes();

    const container = document.getElementById(CONTAINER_ID);
    if (container) esconderAtendimentos(container);
}

// ============================================================================
//  DESCOBERTA DOS AGENDAMENTOS DO CLIENTE
// ============================================================================

function iniciarDescobertaAtendimentos(contexto) {
    if (!contexto || contexto.ciclo !== cicloAtual) return;

    cancelarDescoberta();
    resultadosDescoberta = new Map();

    const agendamentosRef = collection(
        db,
        "empresarios",
        contexto.empresaId,
        "agendamentos"
    );

    const consultas = montarConsultasDescoberta(agendamentosRef, contexto);

    if (consultas.length === 0) {
        sincronizarDocumentosAcompanhados(contexto, []);
        return;
    }

    chavesDescobertaPendentes = new Set(
        consultas.map(({ chave }) => chave)
    );

    consultas.forEach(({ chave, consulta }) => {
        const cancelar = onSnapshot(
            consulta,
            (snapshot) => {
                if (contexto.ciclo !== cicloAtual) return;

                resultadosDescoberta.set(
                    chave,
                    snapshot.docs.map((documento) => ({
                        id: documento.id,
                        ...documento.data()
                    }))
                );

                chavesDescobertaPendentes.delete(chave);
                processarResultadosDescoberta(contexto);
            },
            (error) => {
                if (contexto.ciclo !== cicloAtual) return;

                console.error(
                    `[Pronti Pet] Falha ao identificar atendimentos (${chave}):`,
                    error
                );

                resultadosDescoberta.set(chave, []);
                chavesDescobertaPendentes.delete(chave);
                processarResultadosDescoberta(contexto);
            }
        );

        canceladoresDescoberta.push(cancelar);
    });
}

function montarConsultasDescoberta(agendamentosRef, contexto) {
    const consultas = [];
    const chavesCriadas = new Set();

    const adicionar = (campo, valor) => {
        const valorLimpo = limparTexto(valor);
        const chave = `${campo}:${valorLimpo}`;

        if (!valorLimpo || chavesCriadas.has(chave)) return;

        chavesCriadas.add(chave);
        consultas.push({
            chave,
            consulta: query(
                agendamentosRef,
                where(campo, "==", valorLimpo)
            )
        });
    };

    adicionar("clienteId", contexto.clienteId);
    adicionar("clienteAuthUid", contexto.authUid);
    adicionar("clienteId", contexto.authUid);

    return consultas;
}

function processarResultadosDescoberta(contexto) {
    if (
        contexto.ciclo !== cicloAtual ||
        chavesDescobertaPendentes.size > 0
    ) {
        return;
    }

    const documentosUnicos = new Map();

    resultadosDescoberta.forEach((lista) => {
        lista.forEach((atendimento) => {
            if (atendimento?.id) {
                documentosUnicos.set(atendimento.id, atendimento);
            }
        });
    });

    const candidatos = [...documentosUnicos.values()]
        .filter(ehAtendimentoVisivel)
        .sort(compararPorDataEHorario);

    sincronizarDocumentosAcompanhados(contexto, candidatos);
}

// ============================================================================
//  UM onSnapshot DIRETO PARA CADA agendamentoId
// ============================================================================

function sincronizarDocumentosAcompanhados(contexto, candidatos) {
    if (contexto.ciclo !== cicloAtual) return;

    const idsDesejados = new Set(
        candidatos
            .map((atendimento) => limparTexto(atendimento?.id))
            .filter(Boolean)
    );

    // Remove somente os documentos que deixaram de ser válidos.
    [...canceladoresPorAtendimento.keys()].forEach((agendamentoId) => {
        if (!idsDesejados.has(agendamentoId)) {
            removerAtendimentoAcompanhado(agendamentoId, true);
        }
    });

    // Cria um listener direto para cada documento ainda não acompanhado.
    candidatos.forEach((atendimento) => {
        const agendamentoId = limparTexto(atendimento?.id);

        if (
            agendamentoId &&
            !canceladoresPorAtendimento.has(agendamentoId)
        ) {
            acompanharDocumentoAtendimento(contexto, agendamentoId);
        }
    });

    renderizarTodosAtendimentos();
}

function acompanharDocumentoAtendimento(contexto, agendamentoId) {
    if (
        contexto.ciclo !== cicloAtual ||
        !agendamentoId ||
        canceladoresPorAtendimento.has(agendamentoId)
    ) {
        return;
    }

    const atendimentoRef = doc(
        db,
        "empresarios",
        contexto.empresaId,
        "agendamentos",
        agendamentoId
    );

    const cancelar = onSnapshot(
        atendimentoRef,
        (snapshot) => {
            if (contexto.ciclo !== cicloAtual) return;

            if (!snapshot.exists()) {
                removerAtendimentoAcompanhado(agendamentoId, true);
                return;
            }

            const atendimento = {
                id: snapshot.id,
                ...snapshot.data()
            };

            if (!ehAtendimentoVisivel(atendimento)) {
                removerAtendimentoAcompanhado(agendamentoId, true);
                return;
            }

            atendimentosAtivos.set(agendamentoId, atendimento);
            renderizarTodosAtendimentos();

        },
        (error) => {
            if (contexto.ciclo !== cicloAtual) return;

            console.error(
                `[Pronti Pet] Falha ao acompanhar o atendimento ${agendamentoId}:`,
                error
            );

            removerAtendimentoAcompanhado(agendamentoId, true);
        }
    );

    canceladoresPorAtendimento.set(agendamentoId, cancelar);
}

function removerAtendimentoAcompanhado(
    agendamentoId,
    cancelarListener = false
) {
    const cancelar = canceladoresPorAtendimento.get(agendamentoId);

    if (cancelarListener && cancelar) {
        try {
            cancelar();
        } catch (error) {
            console.warn(
                `[Pronti Pet] Listener do atendimento ${agendamentoId} não encerrado:`,
                error
            );
        }

        canceladoresPorAtendimento.delete(agendamentoId);
    }

    atendimentosAtivos.delete(agendamentoId);

    if (modalAgendamentoId === agendamentoId) {
        removerModalDetalhes();
    }

    renderizarTodosAtendimentos();
}

function cancelarTodosAtendimentos() {
    canceladoresPorAtendimento.forEach((cancelar, agendamentoId) => {
        try {
            cancelar();
        } catch (error) {
            console.warn(
                `[Pronti Pet] Listener do atendimento ${agendamentoId} não encerrado:`,
                error
            );
        }
    });

    canceladoresPorAtendimento.clear();
}

function cancelarDescoberta() {
    canceladoresDescoberta.forEach((cancelar) => {
        try {
            cancelar();
        } catch (error) {
            console.warn(
                "[Pronti Pet] Listener de identificação não encerrado:",
                error
            );
        }
    });

    canceladoresDescoberta = [];
    resultadosDescoberta = new Map();
    chavesDescobertaPendentes = new Set();
}

// ============================================================================
//  REGRAS DE VISIBILIDADE
// ============================================================================

function ehAtendimentoVisivel(atendimento) {
    const statusAtendimento = obterStatusAtendimento(atendimento);

    if (!STATUS_VISIVEIS.has(statusAtendimento)) {
        return false;
    }

    const statusAgendamento = normalizarStatus(
        atendimento?.status || atendimento?.statusAgendamento
    );

    if (STATUS_AGENDAMENTO_OCULTOS.has(statusAgendamento)) {
        return false;
    }

    // Impede que um atendimento antigo, deixado indevidamente como ativo,
    // substitua o atendimento real do dia atual.
    return ehAtendimentoDoDiaAtual(atendimento);
}

function obterStatusAtendimento(atendimento) {
    return normalizarStatus(
        atendimento?.statusAtendimento || "aguardando"
    );
}

function ehAtendimentoDoDiaAtual(atendimento) {
    const dataAgendamento = obterDataAgendamento(atendimento);

    if (dataAgendamento) {
        return datasNoMesmoDia(dataAgendamento, new Date());
    }

    // Compatibilidade defensiva para documentos antigos sem campo de data:
    // só aceita se houver atualização operacional feita hoje.
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);

    return Boolean(
        ultimaAtualizacao &&
        datasNoMesmoDia(ultimaAtualizacao, new Date())
    );
}

function obterDataAgendamento(atendimento) {
    const candidatos = [
        atendimento?.data,
        atendimento?.dataAgendamento,
        atendimento?.dataSelecionada,
        atendimento?.dia,
        atendimento?.dataHoraAgendamento,
        atendimento?.dataHora,
        atendimento?.inicio,
        atendimento?.dataHoraInicio
    ];

    for (const candidato of candidatos) {
        const data = converterDataCalendario(candidato);
        if (data) return data;
    }

    return null;
}

function compararPorDataEHorario(a, b) {
    const momentoA = obterMomentoAgendamento(a);
    const momentoB = obterMomentoAgendamento(b);

    if (momentoA !== momentoB) {
        return momentoA - momentoB;
    }

    return obterNomePet(a).localeCompare(
        obterNomePet(b),
        "pt-BR",
        { sensitivity: "base" }
    );
}

function obterMomentoAgendamento(atendimento) {
    const data = obterDataAgendamento(atendimento);

    if (!data) {
        return obterUltimaAtualizacao(atendimento)?.getTime() || 0;
    }

    const resultado = new Date(data);
    const horario = limparTexto(
        atendimento?.hora ||
        atendimento?.horario ||
        atendimento?.horaAgendamento
    );

    const correspondencia = horario.match(/^(\d{1,2}):(\d{2})/);

    if (correspondencia) {
        resultado.setHours(
            Number(correspondencia[1]),
            Number(correspondencia[2]),
            0,
            0
        );
    }

    return resultado.getTime();
}

// ============================================================================
//  RENDERIZAÇÃO DA LISTA DE ATENDIMENTOS
// ============================================================================

function configurarEventoContainer(container) {
    if (!container || container.dataset.ppAtendimentoEventos === "1") {
        return;
    }

    /*
     * O card já apresenta foto, serviço, status e evolução em tempo real.
     * Não registramos mais ações para abrir uma segunda tela redundante.
     */
    container.dataset.ppAtendimentoEventos = "1";
}

function renderizarTodosAtendimentos() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const atendimentos = [...atendimentosAtivos.values()]
        .filter(ehAtendimentoVisivel)
        .sort(compararPorDataEHorario);

    if (atendimentos.length === 0) {
        esconderAtendimentos(container);
        return;
    }

    container.hidden = false;
    container.style.display = "block";

    container.innerHTML = atendimentos
        .map((atendimento) => montarHtmlCardAtendimento(atendimento))
        .join("");
}

function montarHtmlCardAtendimento(atendimento) {
    const agendamentoId = limparTexto(atendimento?.id);
    const status = obterStatusAtendimento(atendimento);
    const config = STATUS_CONFIG[status];

    if (!agendamentoId || !config || !STATUS_VISIVEIS.has(status)) {
        return "";
    }

    const fluxo = obterFluxoAtendimento(atendimento);
    const indiceAtual = fluxo.indexOf(status);
    const nomePet = obterNomePet(atendimento);
    const fotoPet = obterFotoPet(atendimento);
    const servico = obterNomeServico(atendimento);
    const fotoAtendimento = obterFotoAtendimentoValida(atendimento);
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);

    const miniTimeline = fluxo.map((statusEtapa, indice) => {
        const etapa = STATUS_CONFIG[statusEtapa];
        const classe = obterClasseEtapa(indice, indiceAtual);

        return `
            <span class="vitrine-atendimento-mini-etapa ${classe}">
                ${escaparHtml(etapa.textoCurto)}
            </span>
        `;
    }).join("");

    return `
        <article
            class="vitrine-atendimento-card ${config.classe}"
            data-agendamento-id="${escaparAtributo(agendamentoId)}"
        >
            <span class="vitrine-atendimento-etiqueta">
                ${escaparHtml(config.etiqueta)}
            </span>

            <div class="vitrine-atendimento-resumo">
                ${montarAvatarPet(fotoPet, nomePet)}

                <div class="vitrine-atendimento-info">
                    ${
                        nomePet
                            ? `
                                <h2>
                                    ${escaparHtml(nomePet)}
                                    <span class="vitrine-atendimento-status-texto">
                                        <i class="fa-solid ${config.icone}" aria-hidden="true"></i>
                                        ${escaparHtml(config.texto)}
                                    </span>
                                </h2>
                            `
                            : `
                                <span class="vitrine-atendimento-status-texto">
                                    <i class="fa-solid ${config.icone}" aria-hidden="true"></i>
                                    ${escaparHtml(config.texto)}
                                </span>
                            `
                    }

                    ${servico ? `<p>${escaparHtml(servico)}</p>` : ""}
                    ${
                        ultimaAtualizacao
                            ? `<small>Atualizado em ${formatarDataHora(ultimaAtualizacao)}</small>`
                            : ""
                    }
                </div>

                ${
                    fotoAtendimento
                        ? `
                            <div
                                class="vitrine-atendimento-mini-foto"
                                aria-label="Foto do atendimento de ${escaparAtributo(nomePet || "pet")}"
                            >
                                <img
                                    src="${escaparAtributo(fotoAtendimento.url)}"
                                    alt="Foto do atendimento${nomePet ? ` de ${escaparAtributo(nomePet)}` : ""}"
                                    loading="lazy"
                                >
                            </div>
                        `
                        : ""
                }
            </div>

            <div class="vitrine-atendimento-mini-timeline" aria-label="Etapas do atendimento">
                ${miniTimeline}
            </div>

            <div class="vitrine-atendimento-rodape">
                <small>Atualizações enviadas diretamente pelo pet shop</small>
            </div>
        </article>
    `;
}

function esconderAtendimentos(container) {
    container.hidden = true;
    container.style.display = "none";
    container.innerHTML = "";
}

// ============================================================================
//  MODAL DO ATENDIMENTO SELECIONADO
// ============================================================================

function abrirModalDetalhes(atendimento) {
    if (!MODAL_DETALHES_HABILITADO) {
        removerModalDetalhes();
        return;
    }

    removerModalDetalhes();

    const agendamentoId = limparTexto(atendimento?.id);
    const status = obterStatusAtendimento(atendimento);
    const config = STATUS_CONFIG[status];

    if (
        !agendamentoId ||
        !config ||
        !STATUS_VISIVEIS.has(status)
    ) {
        return;
    }

    modalAgendamentoId = agendamentoId;

    const nomePet = obterNomePet(atendimento);
    const fotoPet = obterFotoPet(atendimento);
    const servico = obterNomeServico(atendimento);
    const observacao = limparTexto(atendimento.observacaoEquipe);
    const fotoAtendimento = obterFotoAtendimentoValida(atendimento);
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "vitrine-atendimento-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute(
        "aria-label",
        `Acompanhamento do atendimento${nomePet ? ` de ${nomePet}` : ""}`
    );

    modal.innerHTML = `
        <div class="vitrine-atendimento-modal-conteudo">
            <header class="vitrine-atendimento-modal-header">
                <div class="vitrine-atendimento-modal-pet">
                    ${montarAvatarPet(fotoPet, nomePet)}

                    <div>
                        <span>Acompanhamento</span>
                        ${nomePet ? `<h2>${escaparHtml(nomePet)}</h2>` : ""}
                        ${servico ? `<p>${escaparHtml(servico)}</p>` : ""}
                    </div>
                </div>

                <button
                    type="button"
                    class="vitrine-atendimento-fechar"
                    data-fechar-atendimento
                    aria-label="Fechar acompanhamento"
                >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>

            <main class="vitrine-atendimento-modal-body">
                <section class="vitrine-atendimento-status-detalhe ${config.classe}">
                    <span>Status atual</span>
                    <strong>
                        <i class="fa-solid ${config.icone}" aria-hidden="true"></i>
                        ${escaparHtml(config.texto)}
                    </strong>
                    ${
                        ultimaAtualizacao
                            ? `<small>Última atualização: ${formatarDataHora(ultimaAtualizacao)}</small>`
                            : ""
                    }
                </section>

                ${montarTimeline(atendimento)}
                ${fotoAtendimento ? montarFotoDetalhe(fotoAtendimento, nomePet) : ""}

                ${
                    observacao
                        ? `
                            <section class="vitrine-atendimento-observacao">
                                <h3>
                                    <i class="fa-solid fa-message" aria-hidden="true"></i>
                                    Recado da equipe
                                </h3>
                                <p>${escaparHtml(observacao)}</p>
                            </section>
                        `
                        : ""
                }
            </main>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add("vitrine-modal-aberto");

    modal
        .querySelector("[data-fechar-atendimento]")
        ?.addEventListener("click", removerModalDetalhes);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) removerModalDetalhes();
    });

    const tratarEscape = (event) => {
        if (event.key === "Escape") removerModalDetalhes();
    };

    modal._tratarEscape = tratarEscape;
    window.addEventListener("keydown", tratarEscape);
}

function removerModalDetalhes() {
    const modal = document.getElementById(MODAL_ID);

    if (modal?._tratarEscape) {
        window.removeEventListener("keydown", modal._tratarEscape);
    }

    modal?.remove();
    modalAgendamentoId = null;
    document.body.classList.remove("vitrine-modal-aberto");
}

// ============================================================================
//  TIMELINE
// ============================================================================

function obterFluxoAtendimento(atendimento) {
    const fluxo =
        atendimento?.fluxoAtendimento ||
        atendimento?.etapasAtendimento ||
        atendimento?.statusPermitidos;

    if (Array.isArray(fluxo) && fluxo.length > 0) {
        const fluxoNormalizado = fluxo
            .map((status) => normalizarStatus(status))
            .filter((status) => STATUS_CONFIG[status]);

        if (fluxoNormalizado.length > 0) {
            return fluxoNormalizado;
        }
    }

    return STATUS_FLUXO_PADRAO;
}

function montarTimeline(atendimento) {
    const fluxo = obterFluxoAtendimento(atendimento);
    const statusAtual = obterStatusAtendimento(atendimento);
    const indiceAtual = fluxo.indexOf(statusAtual);
    const timeline = Array.isArray(atendimento.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    const itens = fluxo.map((status, indice) => {
        const config = STATUS_CONFIG[status];
        const classe = obterClasseEtapa(indice, indiceAtual);
        const dataStatus = buscarDataStatus(timeline, status);

        return `
            <div class="vitrine-atendimento-timeline-item ${classe}">
                <span class="vitrine-atendimento-timeline-marcador">
                    ${
                        classe === "concluida"
                            ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
                            : classe === "atual"
                                ? '<i class="fa-solid fa-circle" aria-hidden="true"></i>'
                                : ""
                    }
                </span>

                <div>
                    <strong>${escaparHtml(config.texto)}</strong>
                    ${dataStatus ? `<small>${formatarDataHora(dataStatus)}</small>` : ""}
                </div>
            </div>
        `;
    }).join("");

    return `
        <section class="vitrine-atendimento-timeline">
            <h3>Etapas do atendimento</h3>
            <div class="vitrine-atendimento-timeline-lista">
                ${itens}
            </div>
        </section>
    `;
}

function obterClasseEtapa(indice, indiceAtual) {
    if (indiceAtual < 0) return "futura";
    if (indice < indiceAtual) return "concluida";
    if (indice === indiceAtual) return "atual";
    return "futura";
}

function buscarDataStatus(timeline, statusProcurado) {
    const item = timeline.find(
        (etapa) => normalizarStatus(etapa?.status) === statusProcurado
    );

    return (
        item?.dataHora ||
        item?.criadoEm ||
        item?.createdAt ||
        null
    );
}

function obterUltimaAtualizacao(atendimento) {
    const atualizacaoDireta = converterParaDate(
        atendimento?.ultimaAtualizacaoStatus
    );

    if (atualizacaoDireta) {
        return atualizacaoDireta;
    }

    const timeline = Array.isArray(atendimento?.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    const datas = timeline
        .map((etapa) => converterParaDate(
            etapa?.dataHora ||
            etapa?.criadoEm ||
            etapa?.createdAt
        ))
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime());

    return datas[0] || null;
}

// ============================================================================
//  FOTO, PET E SERVIÇO
// ============================================================================

function obterFotoAtendimentoValida(atendimento) {
    const url = limparTexto(atendimento?.fotoAtendimentoUrl);
    if (!url) return null;

    const expiraEm = atendimento?.fotoAtendimentoExpiraEm || null;
    const expiracao = converterParaDate(expiraEm);

    if (expiracao && expiracao.getTime() <= Date.now()) {
        return null;
    }

    return { url, expiraEm };
}

function montarFotoDetalhe(foto, nomePet) {
    return `
        <section class="vitrine-atendimento-foto-detalhe">
            <div>
                <h3>
                    <i class="fa-solid fa-camera" aria-hidden="true"></i>
                    Foto enviada pelo pet shop
                </h3>
                ${
                    foto.expiraEm
                        ? `<small>Disponível até ${formatarDataHora(foto.expiraEm)}</small>`
                        : ""
                }
            </div>

            <img
                src="${escaparAtributo(foto.url)}"
                alt="Foto do atendimento${nomePet ? ` de ${escaparAtributo(nomePet)}` : ""}"
                loading="lazy"
            >
        </section>
    `;
}

function obterNomePet(atendimento) {
    return limparTexto(
        atendimento?.petNome ||
        atendimento?.nomePet ||
        atendimento?.nomeAnimal ||
        atendimento?.pet?.nome
    );
}

function obterFotoPet(atendimento) {
    return limparTexto(
        atendimento?.petFotoUrl ||
        atendimento?.fotoPetUrl ||
        atendimento?.fotoAnimal ||
        atendimento?.pet?.fotoUrl
    );
}

function obterNomeServico(atendimento) {
    const servicoObjeto =
        typeof atendimento?.servico === "object"
            ? atendimento.servico?.nome
            : atendimento?.servico;

    const nomes = Array.isArray(atendimento?.servicos)
        ? atendimento.servicos
            .map((servico) => limparTexto(
                servico?.nome ||
                servico?.nomeServico ||
                servico
            ))
            .filter(Boolean)
            .join(", ")
        : "";

    return limparTexto(
        atendimento?.servicoNome ||
        atendimento?.nomeServico ||
        atendimento?.tipoServico ||
        servicoObjeto ||
        nomes
    );
}

function montarAvatarPet(fotoUrl, nomePet) {
    if (fotoUrl) {
        return `
            <img
                class="vitrine-atendimento-avatar"
                src="${escaparAtributo(fotoUrl)}"
                alt="${nomePet ? `Foto de ${escaparAtributo(nomePet)}` : "Foto do pet"}"
                loading="lazy"
            >
        `;
    }

    return `
        <div class="vitrine-atendimento-avatar vitrine-atendimento-avatar-vazio" aria-hidden="true">
            <i class="fa-solid fa-paw"></i>
        </div>
    `;
}

// ============================================================================
//  DATAS E UTILITÁRIOS
// ============================================================================

function normalizarStatus(status) {
    return limparTexto(status)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s-]+/g, "_");
}

function limparTexto(valor) {
    return String(valor || "").trim();
}

function converterDataCalendario(valor) {
    if (!valor) return null;

    if (valor instanceof Date) {
        return Number.isNaN(valor.getTime())
            ? null
            : new Date(valor);
    }

    if (typeof valor?.toDate === "function") {
        const data = valor.toDate();
        return Number.isNaN(data.getTime()) ? null : data;
    }

    if (
        typeof valor === "object" &&
        Number.isFinite(valor.seconds)
    ) {
        const data = new Date(valor.seconds * 1000);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    if (typeof valor === "string") {
        const texto = valor.trim();

        const isoSimples = texto.match(
            /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/
        );

        if (isoSimples) {
            const data = new Date(
                Number(isoSimples[1]),
                Number(isoSimples[2]) - 1,
                Number(isoSimples[3])
            );

            return Number.isNaN(data.getTime()) ? null : data;
        }

        const brasileira = texto.match(
            /^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s,].*)?$/
        );

        if (brasileira) {
            const data = new Date(
                Number(brasileira[3]),
                Number(brasileira[2]) - 1,
                Number(brasileira[1])
            );

            return Number.isNaN(data.getTime()) ? null : data;
        }
    }

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function converterParaDate(valor) {
    if (!valor) return null;

    if (valor instanceof Date) {
        return Number.isNaN(valor.getTime()) ? null : valor;
    }

    if (typeof valor?.toDate === "function") {
        const data = valor.toDate();
        return Number.isNaN(data.getTime()) ? null : data;
    }

    if (
        typeof valor === "object" &&
        Number.isFinite(valor.seconds)
    ) {
        const data = new Date(valor.seconds * 1000);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function datasNoMesmoDia(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function formatarDataHora(valor) {
    const data = converterParaDate(valor);
    if (!data) return "";

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(data);
}

function escaparHtml(valor) {
    return limparTexto(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escaparAtributo(valor) {
    return escaparHtml(valor).replace(/`/g, "&#096;");
}
