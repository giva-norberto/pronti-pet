// ============================================================================
//  VITRINE-ATENDIMENTO.JS — PRONTI PET
// ============================================================================
//  Módulo de leitura do atendimento na vitrine.
//  Não altera status e não injeta CSS.
//
//  HTML necessário:
//  <section id="atendimento-em-andamento-container" hidden></section>
// ============================================================================

import { db } from "./vitrini-firebase.js";

import {
    collection,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const CONTAINER_ID = "atendimento-em-andamento-container";

const STATUS_FLUXO = [
    "aguardando",
    "em_atendimento",
    "finalizado",
    "liberado"
];

const STATUS_CONFIG = {
    aguardando: {
        texto: "Aguardando atendimento",
        icone: "fa-clock",
        classe: "aguardando"
    },
    em_atendimento: {
        texto: "Em atendimento",
        icone: "fa-paw",
        classe: "em-atendimento"
    },
    finalizado: {
        texto: "Atendimento finalizado",
        icone: "fa-circle-check",
        classe: "finalizado"
    },
    liberado: {
        texto: "Liberado para retirada",
        icone: "fa-house-circle-check",
        classe: "liberado"
    }
};

let canceladoresSnapshot = [];
let atendimentosPorOrigem = new Map();
let assinaturaAtual = 0;

export function iniciarAcompanhamentoVitrine({
    empresaId,
    clienteId,
    currentUser
} = {}) {
    encerrarAcompanhamentoVitrine();

    const container = document.getElementById(CONTAINER_ID);

    if (!container) {
        console.warn(
            `[Pronti Pet] Container #${CONTAINER_ID} não encontrado.`
        );
        return null;
    }

    assinaturaAtual += 1;
    const assinaturaId = assinaturaAtual;

    esconderContainer(container);
    atendimentosPorOrigem = new Map();

    const authUid = String(currentUser?.uid || "").trim();
    const clienteResolvido = String(clienteId || "").trim();

    if (!empresaId || (!clienteResolvido && !authUid)) {
        return null;
    }

    const agendamentosRef = collection(
        db,
        "empresarios",
        empresaId,
        "agendamentos"
    );

    const consultas = [];

    if (clienteResolvido) {
        consultas.push({
            chave: `clienteId:${clienteResolvido}`,
            consulta: query(
                agendamentosRef,
                where("clienteId", "==", clienteResolvido)
            )
        });
    }

    if (authUid) {
        consultas.push({
            chave: `clienteAuthUid:${authUid}`,
            consulta: query(
                agendamentosRef,
                where("clienteAuthUid", "==", authUid)
            )
        });

        if (authUid !== clienteResolvido) {
            consultas.push({
                chave: `clienteId:${authUid}`,
                consulta: query(
                    agendamentosRef,
                    where("clienteId", "==", authUid)
                )
            });
        }
    }

    consultas.forEach(({ chave, consulta }) => {
        const unsubscribe = onSnapshot(
            consulta,
            (snapshot) => {
                if (assinaturaId !== assinaturaAtual) return;

                atendimentosPorOrigem.set(
                    chave,
                    snapshot.docs.map((docSnap) => ({
                        id: docSnap.id,
                        ...docSnap.data()
                    }))
                );

                atualizarAtendimentoExibido(container);
            },
            (error) => {
                console.error(
                    `[Pronti Pet] Erro ao acompanhar atendimento (${chave}):`,
                    error
                );

                atendimentosPorOrigem.set(chave, []);
                atualizarAtendimentoExibido(container);
            }
        );

        canceladoresSnapshot.push(unsubscribe);
    });

    return () => encerrarAcompanhamentoVitrine();
}

export function encerrarAcompanhamentoVitrine() {
    assinaturaAtual += 1;

    canceladoresSnapshot.forEach((unsubscribe) => {
        try {
            unsubscribe();
        } catch (error) {
            console.warn(
                "[Pronti Pet] Não foi possível encerrar um listener:",
                error
            );
        }
    });

    canceladoresSnapshot = [];
    atendimentosPorOrigem = new Map();

    const container = document.getElementById(CONTAINER_ID);

    if (container) {
        esconderContainer(container);
        container.innerHTML = "";
    }

    removerModalDetalhes();
}

function atualizarAtendimentoExibido(container) {
    const atendimentosUnicos = new Map();

    atendimentosPorOrigem.forEach((lista) => {
        lista.forEach((atendimento) => {
            if (atendimento?.id) {
                atendimentosUnicos.set(atendimento.id, atendimento);
            }
        });
    });

    const atendimentoAtivo = [...atendimentosUnicos.values()]
        .filter(ehAtendimentoVisivel)
        .sort(compararAtendimentosMaisRecentes)[0];

    if (!atendimentoAtivo) {
        esconderContainer(container);
        container.innerHTML = "";
        removerModalDetalhes();
        return;
    }

    renderizarCardCompacto(container, atendimentoAtivo);
}

function ehAtendimentoVisivel(atendimento) {
    const status = normalizarStatus(atendimento?.statusAtendimento);

    if (!STATUS_FLUXO.includes(status)) {
        return false;
    }

    const statusAgenda = normalizarStatus(
        atendimento?.status ||
        atendimento?.statusAgendamento ||
        ""
    );

    return ![
        "cancelado",
        "cancelado_pelo_cliente",
        "cancelado_pelo_profissional",
        "falta"
    ].includes(statusAgenda);
}

function compararAtendimentosMaisRecentes(a, b) {
    return obterDataOrdenacao(b) - obterDataOrdenacao(a);
}

function obterDataOrdenacao(atendimento) {
    const candidatos = [
        atendimento?.ultimaAtualizacaoStatus,
        atendimento?.atualizadoEm,
        atendimento?.dataHoraInicioAtendimento,
        atendimento?.createdAt,
        atendimento?.criadoEm
    ];

    for (const candidato of candidatos) {
        const data = converterParaDate(candidato);

        if (data) return data.getTime();
    }

    const dataTexto = String(atendimento?.data || "").trim();
    const horarioTexto = String(atendimento?.horario || "00:00").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dataTexto)) {
        const data = new Date(`${dataTexto}T${horarioTexto || "00:00"}:00`);
        if (!Number.isNaN(data.getTime())) return data.getTime();
    }

    return 0;
}

function renderizarCardCompacto(container, atendimento) {
    const status = normalizarStatus(atendimento.statusAtendimento);
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.aguardando;

    const nomePet = obterNomePet(atendimento);
    const fotoPet = obterFotoPet(atendimento);
    const servico = obterNomeServico(atendimento);
    const fotoAtendimento = obterFotoAtendimentoValida(atendimento);
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);

    container.hidden = false;
    container.style.display = "block";

    container.innerHTML = `
        <article class="vitrine-atendimento-card ${config.classe}">
            <div class="vitrine-atendimento-topo">
                <div class="vitrine-atendimento-identidade">
                    ${montarAvatarPet(fotoPet, nomePet)}

                    <div>
                        <span class="vitrine-atendimento-etiqueta">
                            Atendimento em andamento
                        </span>

                        <h2>${escaparHtml(nomePet)}</h2>
                        ${servico ? `<p>${escaparHtml(servico)}</p>` : ""}
                    </div>
                </div>

                <span class="vitrine-atendimento-status">
                    <i class="fa-solid ${config.icone}" aria-hidden="true"></i>
                    ${escaparHtml(config.texto)}
                </span>
            </div>

            ${
                fotoAtendimento
                    ? `
                        <button
                            type="button"
                            class="vitrine-atendimento-foto"
                            data-acao-atendimento="abrir"
                            aria-label="Abrir acompanhamento do atendimento"
                        >
                            <img
                                src="${escaparAtributo(fotoAtendimento.url)}"
                                alt="Foto recente do atendimento de ${escaparAtributo(nomePet)}"
                                loading="lazy"
                            >

                            <span>
                                <i class="fa-solid fa-camera" aria-hidden="true"></i>
                                Nova foto do pet shop
                            </span>
                        </button>
                    `
                    : ""
            }

            <div class="vitrine-atendimento-rodape">
                <small>
                    ${
                        ultimaAtualizacao
                            ? `Atualizado ${formatarDataHora(ultimaAtualizacao)}`
                            : "Acompanhe as atualizações do pet shop"
                    }
                </small>

                <button
                    type="button"
                    class="vitrine-atendimento-abrir"
                    data-acao-atendimento="abrir"
                >
                    Acompanhar
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </button>
            </div>
        </article>
    `;

    container
        .querySelectorAll('[data-acao-atendimento="abrir"]')
        .forEach((botao) => {
            botao.addEventListener("click", () => {
                abrirModalDetalhes(atendimento);
            });
        });
}

function abrirModalDetalhes(atendimento) {
    removerModalDetalhes();

    const status = normalizarStatus(atendimento.statusAtendimento);
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.aguardando;

    const nomePet = obterNomePet(atendimento);
    const fotoPet = obterFotoPet(atendimento);
    const servico = obterNomeServico(atendimento);
    const observacao = limparTexto(atendimento.observacaoEquipe);
    const fotoAtendimento = obterFotoAtendimentoValida(atendimento);
    const ultimaAtualizacao = obterUltimaAtualizacao(atendimento);

    const modal = document.createElement("div");
    modal.id = "vitrine-atendimento-modal";
    modal.className = "vitrine-atendimento-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute(
        "aria-label",
        `Acompanhamento do atendimento de ${nomePet}`
    );

    modal.innerHTML = `
        <div class="vitrine-atendimento-modal-conteudo">
            <header class="vitrine-atendimento-modal-header">
                <div class="vitrine-atendimento-modal-pet">
                    ${montarAvatarPet(fotoPet, nomePet)}

                    <div>
                        <span>Acompanhamento</span>
                        <h2>${escaparHtml(nomePet)}</h2>
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

                    <small>
                        ${
                            ultimaAtualizacao
                                ? `Última atualização: ${formatarDataHora(ultimaAtualizacao)}`
                                : "Aguardando atualização do pet shop"
                        }
                    </small>
                </section>

                ${montarTimeline(atendimento)}

                ${
                    fotoAtendimento
                        ? montarFotoDetalhe(fotoAtendimento, nomePet)
                        : ""
                }

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

    const fechar = () => removerModalDetalhes();

    modal
        .querySelector("[data-fechar-atendimento]")
        ?.addEventListener("click", fechar);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) fechar();
    });

    const tratarEscape = (event) => {
        if (event.key === "Escape") fechar();
    };

    modal._tratarEscape = tratarEscape;
    window.addEventListener("keydown", tratarEscape);
}

function removerModalDetalhes() {
    const modal = document.getElementById("vitrine-atendimento-modal");

    if (!modal) {
        document.body.classList.remove("vitrine-modal-aberto");
        return;
    }

    if (modal._tratarEscape) {
        window.removeEventListener("keydown", modal._tratarEscape);
    }

    modal.remove();
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
        const concluido = indice <= indiceAtual;
        const dataStatus = buscarDataStatus(timeline, status);

        return `
            <div class="vitrine-atendimento-timeline-item ${
                concluido ? "concluido" : "pendente"
            }">
                <span class="vitrine-atendimento-timeline-marcador">
                    ${
                        concluido
                            ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
                            : ""
                    }
                </span>

                <div>
                    <strong>${escaparHtml(config.texto)}</strong>
                    ${
                        dataStatus
                            ? `<small>${formatarHorario(dataStatus)}</small>`
                            : ""
                    }
                </div>
            </div>
        `;
    }).join("");

    return `
        <section class="vitrine-atendimento-timeline">
            <h3>Etapas do atendimento</h3>
            <div>${itens}</div>
        </section>
    `;
}

function buscarDataStatus(timeline, statusProcurado) {
    const item = timeline.find(
        (etapa) =>
            normalizarStatus(etapa?.status) === statusProcurado
    );

    return item?.dataHora || item?.criadoEm || item?.createdAt || null;
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
                alt="Foto do atendimento de ${escaparAtributo(nomePet)}"
                loading="lazy"
            >
        </section>
    `;
}

function obterFotoAtendimentoValida(atendimento) {
    const url = String(
        atendimento?.fotoAtendimentoUrl ||
        atendimento?.ultimaFotoAtendimentoUrl ||
        ""
    ).trim();

    if (!url) return null;

    const expiraEm =
        atendimento?.fotoAtendimentoExpiraEm ||
        atendimento?.ultimaFotoAtendimentoExpiraEm ||
        null;

    const expiracao = converterParaDate(expiraEm);

    if (expiracao && expiracao.getTime() <= Date.now()) {
        return null;
    }

    return { url, expiraEm };
}

function obterNomePet(atendimento) {
    return limparTexto(
        atendimento?.petNome ||
        atendimento?.pet?.nome ||
        atendimento?.nomePet ||
        atendimento?.nomeAnimal ||
        "Seu pet"
    );
}

function obterFotoPet(atendimento) {
    return limparTexto(
        atendimento?.petFotoUrl ||
        atendimento?.pet?.fotoUrl ||
        atendimento?.fotoPetUrl ||
        ""
    );
}

function obterNomeServico(atendimento) {
    return limparTexto(
        atendimento?.servicoNome ||
        atendimento?.servico?.nome ||
        atendimento?.servicosNome ||
        ""
    );
}

function obterUltimaAtualizacao(atendimento) {
    return (
        atendimento?.ultimaAtualizacaoStatus ||
        atendimento?.atualizadoEm ||
        atendimento?.updatedAt ||
        null
    );
}

function montarAvatarPet(fotoUrl, nomePet) {
    if (fotoUrl) {
        return `
            <img
                class="vitrine-atendimento-avatar"
                src="${escaparAtributo(fotoUrl)}"
                alt="Foto de ${escaparAtributo(nomePet)}"
                loading="lazy"
            >
        `;
    }

    const inicial = nomePet
        ? nomePet.charAt(0).toUpperCase()
        : "P";

    return `
        <div
            class="vitrine-atendimento-avatar vitrine-atendimento-avatar-vazio"
            aria-hidden="true"
        >
            ${escaparHtml(inicial)}
        </div>
    `;
}

function esconderContainer(container) {
    container.hidden = true;
    container.style.display = "none";
}

function normalizarStatus(status) {
    return String(status || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");
}

function limparTexto(texto) {
    return String(texto || "").trim();
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
        return new Date(valor.seconds * 1000);
    }

    if (
        typeof valor === "string" ||
        typeof valor === "number"
    ) {
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    return null;
}

function formatarDataHora(valor) {
    const data = converterParaDate(valor);

    if (!data) return "";

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

function escaparHtml(valor) {
    return String(valor || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escaparAtributo(valor) {
    return escaparHtml(valor);
}
