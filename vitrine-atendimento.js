// ============================================================================
//  VITRINE-ATENDIMENTO.JS — PRONTI PET
// ============================================================================
//  Leitura em tempo real do atendimento na vitrine do cliente.
//  A vitrine não altera dados no Firestore.
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

const STATUS_FLUXO = [
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
        icone: "fa-clock",
        classe: "aguardando"
    },
    em_atendimento: {
        texto: "Em Atendimento",
        textoCurto: "Em atendimento",
        icone: "fa-paw",
        classe: "em-atendimento"
    },
    finalizado: {
        texto: "Finalizado",
        textoCurto: "Finalizado",
        icone: "fa-circle-check",
        classe: "finalizado"
    },
    liberado: {
        texto: "Liberado para Retirada",
        textoCurto: "Liberado",
        icone: "fa-house-circle-check",
        classe: "liberado"
    },
    retirado: {
        texto: "Pet Retirado",
        textoCurto: "Retirado",
        icone: "fa-flag-checkered",
        classe: "retirado"
    }
};

let cicloAtual = 0;
let contextoAtual = null;
let canceladoresDescoberta = [];
let canceladorDocumento = null;
let resultadosDescoberta = new Map();
let chavesDescobertaPendentes = new Set();
let atendimentoIdAcompanhado = null;

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

    esconderAtendimento(container);

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

    iniciarDescobertaAtendimento(contextoAtual);

    return () => encerrarAcompanhamentoVitrine();
}

export function encerrarAcompanhamentoVitrine() {
    cicloAtual += 1;
    contextoAtual = null;
    atendimentoIdAcompanhado = null;
    resultadosDescoberta = new Map();
    chavesDescobertaPendentes = new Set();

    cancelarDescoberta();
    cancelarDocumento();
    removerModalDetalhes();

    const container = document.getElementById(CONTAINER_ID);
    if (container) esconderAtendimento(container);
}

function iniciarDescobertaAtendimento(contexto) {
    if (!contexto || contexto.ciclo !== cicloAtual) return;

    cancelarDescoberta();
    cancelarDocumento();
    atendimentoIdAcompanhado = null;
    resultadosDescoberta = new Map();

    const agendamentosRef = collection(
        db,
        "empresarios",
        contexto.empresaId,
        "agendamentos"
    );

    const consultas = montarConsultasDescoberta(agendamentosRef, contexto);

    if (consultas.length === 0) return;

    chavesDescobertaPendentes = new Set(
        consultas.map(({ chave }) => chave)
    );

    consultas.forEach(({ chave, consulta }) => {
        const cancelar = onSnapshot(
            consulta,
            (snapshot) => {
                if (contexto.ciclo !== cicloAtual || canceladorDocumento) return;

                resultadosDescoberta.set(
                    chave,
                    snapshot.docs.map((documento) => ({
                        id: documento.id,
                        ...documento.data()
                    }))
                );
                chavesDescobertaPendentes.delete(chave);

                tentarFixarDocumentoAtendimento(contexto);
            },
            (error) => {
                if (contexto.ciclo !== cicloAtual) return;

                console.error(
                    `[Pronti Pet] Falha ao identificar atendimento (${chave}):`,
                    error
                );

                resultadosDescoberta.set(chave, []);
                chavesDescobertaPendentes.delete(chave);
                tentarFixarDocumentoAtendimento(contexto);
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

function tentarFixarDocumentoAtendimento(contexto) {
    if (
        contexto.ciclo !== cicloAtual ||
        canceladorDocumento ||
        atendimentoIdAcompanhado ||
        chavesDescobertaPendentes.size > 0
    ) {
        return;
    }

    const unicos = new Map();

    resultadosDescoberta.forEach((lista) => {
        lista.forEach((atendimento) => {
            if (atendimento?.id) unicos.set(atendimento.id, atendimento);
        });
    });

    const selecionado = [...unicos.values()]
        .filter(ehAtendimentoVisivel)
        .sort(compararMaisRecentes)[0];

    if (!selecionado?.id) {
        const container = document.getElementById(CONTAINER_ID);
        if (container) esconderAtendimento(container);
        return;
    }

    atendimentoIdAcompanhado = selecionado.id;
    cancelarDescoberta();
    acompanharDocumentoAtendimento(contexto, selecionado.id);
}

function acompanharDocumentoAtendimento(contexto, agendamentoId) {
    if (contexto.ciclo !== cicloAtual) return;

    cancelarDocumento();

    const atendimentoRef = doc(
        db,
        "empresarios",
        contexto.empresaId,
        "agendamentos",
        agendamentoId
    );

    canceladorDocumento = onSnapshot(
        atendimentoRef,
        (snapshot) => {
            if (contexto.ciclo !== cicloAtual) return;

            if (!snapshot.exists()) {
                ocultarERetomarDescoberta(contexto, agendamentoId);
                return;
            }

            const atendimento = {
                id: snapshot.id,
                ...snapshot.data()
            };

            if (!ehAtendimentoVisivel(atendimento)) {
                ocultarERetomarDescoberta(contexto, agendamentoId);
                return;
            }

            const container = document.getElementById(CONTAINER_ID);
            if (!container) return;

            const modalEstavaAberto = Boolean(document.getElementById(MODAL_ID));

            renderizarCardCompacto(container, atendimento);

            if (modalEstavaAberto) {
                abrirModalDetalhes(atendimento);
            }
        },
        (error) => {
            if (contexto.ciclo !== cicloAtual) return;

            console.error(
                `[Pronti Pet] Falha ao acompanhar o atendimento ${agendamentoId}:`,
                error
            );

            const container = document.getElementById(CONTAINER_ID);
            if (container) esconderAtendimento(container);
            removerModalDetalhes();
        }
    );
}

function ocultarERetomarDescoberta(contexto, agendamentoId) {
    const container = document.getElementById(CONTAINER_ID);
    if (container) esconderAtendimento(container);

    removerModalDetalhes();
    cancelarDocumento();

    if (atendimentoIdAcompanhado === agendamentoId) {
        atendimentoIdAcompanhado = null;
    }

    queueMicrotask(() => {
        if (contexto.ciclo === cicloAtual) {
            iniciarDescobertaAtendimento(contexto);
        }
    });
}

function cancelarDescoberta() {
    canceladoresDescoberta.forEach((cancelar) => {
        try {
            cancelar();
        } catch (error) {
            console.warn("[Pronti Pet] Listener de identificação não encerrado:", error);
        }
    });

    canceladoresDescoberta = [];
    resultadosDescoberta = new Map();
    chavesDescobertaPendentes = new Set();
}

function cancelarDocumento() {
    if (!canceladorDocumento) return;

    try {
        canceladorDocumento();
    } catch (error) {
        console.warn("[Pronti Pet] Listener do atendimento não encerrado:", error);
    }

    canceladorDocumento = null;
}

function ehAtendimentoVisivel(atendimento) {
    const statusAtendimento = normalizarStatus(atendimento?.statusAtendimento);

    if (!STATUS_VISIVEIS.has(statusAtendimento)) return false;

    const statusAgendamento = normalizarStatus(
        atendimento?.status || atendimento?.statusAgendamento
    );

    return !STATUS_AGENDAMENTO_OCULTOS.has(statusAgendamento);
}

function compararMaisRecentes(a, b) {
    return obterMomentoOrdenacao(b) - obterMomentoOrdenacao(a);
}

function obterMomentoOrdenacao(atendimento) {
    const timeline = Array.isArray(atendimento?.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    const momentosTimeline = timeline
        .map((etapa) => converterParaDate(etapa?.dataHora)?.getTime() || 0)
        .filter(Boolean);

    if (momentosTimeline.length > 0) {
        return Math.max(...momentosTimeline);
    }

    const data = limparTexto(atendimento?.data);
    const horario = limparTexto(atendimento?.horario) || "00:00";

    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        const momento = new Date(`${data}T${horario}:00`);
        if (!Number.isNaN(momento.getTime())) return momento.getTime();
    }

    return 0;
}

function renderizarCardCompacto(container, atendimento) {
    const status = normalizarStatus(atendimento.statusAtendimento);
    const config = STATUS_CONFIG[status];

    if (!config) {
        esconderAtendimento(container);
        return;
    }

    const nomePet = obterNomePet(atendimento);
    const fotoPet = obterFotoPet(atendimento);
    const servico = obterNomeServico(atendimento);
    const fotoAtendimento = obterFotoAtendimentoValida(atendimento);
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);
    const indiceAtual = STATUS_FLUXO.indexOf(status);

    const miniTimeline = STATUS_FLUXO.map((statusEtapa, indice) => {
        const etapa = STATUS_CONFIG[statusEtapa];
        const classe = obterClasseEtapa(indice, indiceAtual);

        return `
            <span class="vitrine-atendimento-mini-etapa ${classe}">
                ${escaparHtml(etapa.textoCurto)}
            </span>
        `;
    }).join("");

    container.hidden = false;
    container.style.display = "block";

    container.innerHTML = `
        <article class="vitrine-atendimento-card ${config.classe}">
            <span class="vitrine-atendimento-etiqueta">
                Atendimento em andamento
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
                            <button
                                type="button"
                                class="vitrine-atendimento-mini-foto"
                                data-acao-atendimento="abrir"
                                aria-label="Ver foto do atendimento"
                            >
                                <i class="fa-solid fa-camera" aria-hidden="true"></i>
                                Ver foto
                            </button>
                        `
                        : ""
                }
            </div>

            <div class="vitrine-atendimento-mini-timeline" aria-label="Etapas do atendimento">
                ${miniTimeline}
            </div>

            <div class="vitrine-atendimento-rodape">
                <small>Atualizações enviadas diretamente pelo pet shop</small>

                <button
                    type="button"
                    class="vitrine-atendimento-abrir"
                    data-acao-atendimento="abrir"
                >
                    Acompanhar atendimento
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
            </div>
        </article>
    `;

    container
        .querySelectorAll('[data-acao-atendimento="abrir"]')
        .forEach((botao) => {
            botao.addEventListener("click", () => abrirModalDetalhes(atendimento));
        });
}

function abrirModalDetalhes(atendimento) {
    removerModalDetalhes();

    const status = normalizarStatus(atendimento.statusAtendimento);
    const config = STATUS_CONFIG[status];
    if (!config || !STATUS_VISIVEIS.has(status)) return;

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
    modal.setAttribute("aria-label", "Acompanhamento do atendimento");

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
    document.body.classList.remove("vitrine-modal-aberto");
}

function montarTimeline(atendimento) {
    const statusAtual = normalizarStatus(atendimento.statusAtendimento);
    const indiceAtual = STATUS_FLUXO.indexOf(statusAtual);
    const timeline = Array.isArray(atendimento.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    const itens = STATUS_FLUXO.map((status, indice) => {
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
    if (indice < indiceAtual) return "concluida";
    if (indice === indiceAtual) return "atual";
    return "futura";
}

function buscarDataStatus(timeline, statusProcurado) {
    const item = timeline.find(
        (etapa) => normalizarStatus(etapa?.status) === statusProcurado
    );

    return item?.dataHora || null;
}

function obterUltimaAtualizacao(atendimento) {
    const timeline = Array.isArray(atendimento.timelineAtendimento)
        ? atendimento.timelineAtendimento
        : [];

    const datas = timeline
        .map((etapa) => converterParaDate(etapa?.dataHora))
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime());

    return datas[0] || null;
}

function obterFotoAtendimentoValida(atendimento) {
    const url = limparTexto(atendimento?.fotoAtendimentoUrl);
    if (!url) return null;

    const expiraEm = atendimento?.fotoAtendimentoExpiraEm || null;
    const expiracao = converterParaDate(expiraEm);

    if (expiracao && expiracao.getTime() <= Date.now()) return null;

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
        atendimento?.pet?.nome
    );
}

function obterFotoPet(atendimento) {
    return limparTexto(
        atendimento?.petFotoUrl ||
        atendimento?.fotoPetUrl ||
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
            .map((servico) => limparTexto(servico?.nome || servico?.nomeServico || servico))
            .filter(Boolean)
            .join(", ")
        : "";

    return limparTexto(
        atendimento?.servicoNome ||
        atendimento?.nomeServico ||
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

function esconderAtendimento(container) {
    container.hidden = true;
    container.style.display = "none";
    container.innerHTML = "";
}

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

function converterParaDate(valor) {
    if (!valor) return null;

    if (valor instanceof Date) {
        return Number.isNaN(valor.getTime()) ? null : valor;
    }

    if (typeof valor?.toDate === "function") {
        const data = valor.toDate();
        return Number.isNaN(data.getTime()) ? null : data;
    }

    if (typeof valor === "object" && Number.isFinite(valor.seconds)) {
        return new Date(valor.seconds * 1000);
    }

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
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
