/*
=========================================================
 PRONTI PET — acompanhamento-atendimento.js
=========================================================
 Módulo separado da vitrine.

 Faz:
 - Escuta atendimento em tempo real no Firestore
 - Mostra status atual
 - Mostra linha do tempo
 - Mostra observação da equipe
 - Mostra foto do atendimento por 24h
 - Mostra botão para baixar/abrir foto
 - Não altera status
 - Não usa Cloud Functions para status
=========================================================
*/

import { db } from "./firebase-config.js";

import {
    collection,
    query,
    where,
    limit,
    onSnapshot,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CONTAINER_ID = "acompanhamento-atendimento-container";

const STATUS_FLUXO = [
    "recebido",
    "em_banho",
    "em_tosa",
    "finalizado",
    "liberado"
];

const STATUS_CONFIG = {
    recebido: {
        texto: "Recebido",
        emoji: "🟡",
        classe: "status-recebido"
    },
    em_banho: {
        texto: "Em Banho",
        emoji: "🔵",
        classe: "status-banho"
    },
    em_tosa: {
        texto: "Em Tosa",
        emoji: "🟣",
        classe: "status-tosa"
    },
    finalizado: {
        texto: "Finalizado",
        emoji: "🟢",
        classe: "status-finalizado"
    },
    liberado: {
        texto: "Liberado para Retirada",
        emoji: "✅",
        classe: "status-liberado"
    }
};

const STATUS_ALIASES = {
    "recebido": "recebido",
    "em_banho": "em_banho",
    "banho": "em_banho",
    "em banho": "em_banho",
    "em_tosa": "em_tosa",
    "tosa": "em_tosa",
    "em tosa": "em_tosa",
    "finalizado": "finalizado",
    "concluido": "finalizado",
    "concluído": "finalizado",
    "liberado": "liberado",
    "liberado_para_retirada": "liberado",
    "liberado para retirada": "liberado",
    "pronto": "liberado"
};

/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */

export function iniciarAcompanhamentoAtendimento(empresaId, currentUser) {
    const container = document.getElementById(CONTAINER_ID);

    if (!container) {
        console.warn(`[Pronti Pet] Container #${CONTAINER_ID} não encontrado.`);
        return null;
    }

    aplicarCssAcompanhamento();

    if (!empresaId || !currentUser?.uid) {
        renderizarEstadoVazio(
            container,
            "Faça login para acompanhar o atendimento do seu pet."
        );
        return null;
    }

    renderizarCarregando(container);

    const agendamentosRef = collection(
        db,
        "empresarios",
        empresaId,
        "agendamentos"
    );

    /*
      Busca agendamentos ativos do tutor.
      Não usamos orderBy aqui para evitar necessidade de índice composto.
      A escolha do atendimento mais recente é feita no JavaScript.
    */
    const q = query(
        agendamentosRef,
        where("clienteId", "==", currentUser.uid),
        where("status", "==", "ativo"),
        limit(20)
    );

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            if (snapshot.empty) {
                renderizarEstadoVazio(container);
                return;
            }

            const atendimentos = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            const atendimentoAtivo = escolherAtendimentoParaExibir(atendimentos);

            if (!atendimentoAtivo) {
                renderizarEstadoVazio(container);
                return;
            }

            renderizarAcompanhamento(container, atendimentoAtivo);
        },
        (error) => {
            console.error("[Pronti Pet] Erro ao escutar acompanhamento:", error);
            renderizarErro(container);
        }
    );

    return unsubscribe;
}

/* =====================================================
   ESCOLHA DO ATENDIMENTO
===================================================== */

function escolherAtendimentoParaExibir(atendimentos) {
    const comAcompanhamento = atendimentos.filter((atendimento) => {
        const status = normalizarStatus(atendimento.statusAtendimento);

        return STATUS_FLUXO.includes(status);
    });

    if (comAcompanhamento.length === 0) return null;

    return comAcompanhamento.sort((a, b) => {
        const dataA = obterDataOrdenacao(a);
        const dataB = obterDataOrdenacao(b);

        return dataB - dataA;
    })[0];
}

function obterDataOrdenacao(atendimento) {
    const candidatos = [
        atendimento.ultimaAtualizacaoStatus,
        atendimento.dataHora,
        atendimento.criadoEm,
        atendimento.createdAt,
        atendimento.data
    ];

    for (const valor of candidatos) {
        const data = converterParaDate(valor);
        if (data) return data.getTime();
    }

    return 0;
}

/* =====================================================
   RENDERIZAÇÃO PRINCIPAL
===================================================== */

function renderizarAcompanhamento(container, atendimento) {
    const statusAtual = normalizarStatus(atendimento.statusAtendimento);
    const statusInfo = STATUS_CONFIG[statusAtual] || STATUS_CONFIG.recebido;

    const nomePet =
        atendimento.petNome ||
        atendimento.nomePet ||
        atendimento.nomeAnimal ||
        atendimento.pet?.nome ||
        "Seu pet";

    const observacao = limparTexto(
        atendimento.observacaoEquipe ||
        atendimento.observacaoAtendimento ||
        atendimento.recadoEquipe
    );

    const fotoUrl =
        atendimento.fotoAtendimentoUrl ||
        atendimento.fotoUrl ||
        atendimento.fotoFinalizacaoUrl ||
        "";

    const fotoCriadaEm =
        atendimento.fotoAtendimentoCriadaEm ||
        atendimento.fotoCriadaEm ||
        atendimento.dataFotoAtendimento ||
        null;

    const fotoExpiraEm =
        atendimento.fotoAtendimentoExpiraEm ||
        atendimento.fotoExpiraEm ||
        calcularExpiracaoFoto(fotoCriadaEm);

    const fotoEstaExpirada = fotoExpirada(fotoExpiraEm);

    container.innerHTML = `
        <section class="pp-acompanhamento-card">

            <header class="pp-acompanhamento-header">
                <span class="pp-acompanhamento-tag">
                    Acompanhamento em tempo real
                </span>

                <h2>🐾 ${escaparHtml(nomePet)}</h2>

                <p>
                    Meu pet está sendo cuidado.
                    Eu estou acompanhando.
                </p>
            </header>

            ${renderizarStatusPrincipal(
                statusInfo,
                atendimento.ultimaAtualizacaoStatus
            )}

            ${renderizarTimeline(
                statusAtual,
                atendimento.timelineAtendimento
            )}

            ${
                fotoUrl && !fotoEstaExpirada
                    ? renderizarFoto(fotoUrl, fotoExpiraEm)
                    : ""
            }

            ${observacao ? renderizarObservacao(observacao) : ""}

        </section>
    `;
}

/* =====================================================
   STATUS PRINCIPAL
===================================================== */

function renderizarStatusPrincipal(statusInfo, ultimaAtualizacao) {
    return `
        <div class="pp-status-principal ${statusInfo.classe}">
            <div class="pp-status-emoji">
                ${statusInfo.emoji}
            </div>

            <div class="pp-status-conteudo">
                <span class="pp-status-label">Status atual</span>

                <strong>${statusInfo.texto}</strong>

                <small>
                    Última atualização:
                    ${formatarDataHora(ultimaAtualizacao)}
                </small>
            </div>
        </div>
    `;
}

/* =====================================================
   LINHA DO TEMPO
===================================================== */

function renderizarTimeline(statusAtual, timelineAtendimento = []) {
    const indiceAtual = STATUS_FLUXO.indexOf(statusAtual);

    const itens = STATUS_FLUXO.map((status, index) => {
        const config = STATUS_CONFIG[status];
        const concluido = index <= indiceAtual;
        const dataStatus = buscarDataNaTimeline(status, timelineAtendimento);

        return `
            <div class="pp-timeline-item ${concluido ? "concluido" : "pendente"}">
                <div class="pp-timeline-marcador">
                    ${concluido ? "✓" : "○"}
                </div>

                <div class="pp-timeline-info">
                    <strong>${config.texto}</strong>

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
        <div class="pp-timeline-card">
            <h3>📊 Linha do Tempo do Atendimento</h3>

            <div class="pp-timeline-lista">
                ${itens}
            </div>
        </div>
    `;
}

function buscarDataNaTimeline(status, timelineAtendimento) {
    if (!Array.isArray(timelineAtendimento)) return null;

    const item = timelineAtendimento.find((etapa) => {
        return normalizarStatus(etapa?.status) === status;
    });

    return item?.dataHora || item?.criadoEm || item?.createdAt || null;
}

/* =====================================================
   FOTO DO ATENDIMENTO
===================================================== */

function renderizarFoto(fotoUrl, fotoExpiraEm) {
    return `
        <div class="pp-foto-card">
            <div class="pp-foto-header">
                <h3>📸 Nova Foto Disponível</h3>
                <small>Disponível por 24 horas</small>
            </div>

            <img
                class="pp-foto-img"
                src="${escaparAtributo(fotoUrl)}"
                alt="Foto do atendimento do pet"
                loading="lazy"
            />

            <a
                class="pp-foto-download"
                href="${escaparAtributo(fotoUrl)}"
                download="foto-pronti-pet.jpg"
                target="_blank"
                rel="noopener noreferrer"
            >
                ⬇️ Baixar / Abrir Foto
            </a>

            ${
                fotoExpiraEm
                    ? `
                        <p class="pp-foto-expira">
                            Expira em:
                            ${formatarDataHora(fotoExpiraEm)}
                        </p>
                    `
                    : ""
            }
        </div>
    `;
}

function calcularExpiracaoFoto(fotoCriadaEm) {
    const data = converterParaDate(fotoCriadaEm);

    if (!data) return null;

    return new Date(data.getTime() + 24 * 60 * 60 * 1000);
}

function fotoExpirada(dataExpiracao) {
    if (!dataExpiracao) return false;

    const data = converterParaDate(dataExpiracao);

    if (!data) return false;

    return data.getTime() <= Date.now();
}

/* =====================================================
   OBSERVAÇÃO DA EQUIPE
===================================================== */

function renderizarObservacao(observacao) {
    return `
        <div class="pp-observacao-card">
            <h3>💬 Observação da Equipe</h3>
            <p>${escaparHtml(observacao)}</p>
        </div>
    `;
}

/* =====================================================
   ESTADOS
===================================================== */

function renderizarCarregando(container) {
    container.innerHTML = `
        <section class="pp-acompanhamento-card pp-estado">
            <p>🐾 Carregando acompanhamento...</p>
        </section>
    `;
}

function renderizarEstadoVazio(container, mensagem = null) {
    container.innerHTML = `
        <section class="pp-acompanhamento-card pp-estado">
            <h3>🐾 Nenhum atendimento em andamento</h3>

            <p>
                ${escaparHtml(
                    mensagem ||
                    "Seu pet não possui atendimento ativo no momento."
                )}
            </p>
        </section>
    `;
}

function renderizarErro(container) {
    container.innerHTML = `
        <section class="pp-acompanhamento-card pp-estado pp-erro">
            <h3>Não foi possível carregar o acompanhamento</h3>
            <p>Tente novamente em alguns instantes.</p>
        </section>
    `;
}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function normalizarStatus(status) {
    if (!status) return "";

    const statusBase = String(status)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

    return STATUS_ALIASES[statusBase] || statusBase;
}

function limparTexto(texto) {
    if (!texto) return "";
    return String(texto).trim();
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
   CSS INJETADO
   Fica dentro do arquivo para não precisar criar outro CSS agora.
===================================================== */

function aplicarCssAcompanhamento() {
    if (document.getElementById("pp-acompanhamento-css")) return;

    const style = document.createElement("style");
    style.id = "pp-acompanhamento-css";

    style.textContent = `
        .pp-acompanhamento-card {
            width: 100%;
            max-width: 760px;
            margin: 18px auto;
            padding: 18px;
            border-radius: 24px;
            background: #ffffff;
            box-shadow: 0 12px 35px rgba(75, 35, 130, 0.12);
            box-sizing: border-box;
            font-family: inherit;
        }

        .pp-acompanhamento-header {
            margin-bottom: 16px;
        }

        .pp-acompanhamento-tag {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 999px;
            background: #f1e9ff;
            color: #6d28d9;
            font-size: 0.78rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .pp-acompanhamento-header h2 {
            margin: 0;
            font-size: 1.7rem;
            color: #2b164c;
        }

        .pp-acompanhamento-header p {
            margin: 6px 0 0;
            color: #6b6475;
            font-size: 0.95rem;
        }

        .pp-status-principal {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 18px;
            border-radius: 22px;
            margin: 14px 0;
            background: linear-gradient(135deg, #6d28d9, #9333ea);
            color: #ffffff;
        }

        .pp-status-emoji {
            width: 58px;
            height: 58px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.9rem;
            flex-shrink: 0;
        }

        .pp-status-conteudo {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .pp-status-label {
            font-size: 0.78rem;
            opacity: 0.9;
            font-weight: 600;
        }

        .pp-status-conteudo strong {
            font-size: 1.45rem;
            line-height: 1.1;
        }

        .pp-status-conteudo small {
            font-size: 0.82rem;
            opacity: 0.9;
        }

        .pp-timeline-card,
        .pp-foto-card,
        .pp-observacao-card {
            margin-top: 16px;
            padding: 16px;
            border-radius: 20px;
            background: #faf7ff;
            border: 1px solid #eee2ff;
        }

        .pp-timeline-card h3,
        .pp-foto-card h3,
        .pp-observacao-card h3 {
            margin: 0 0 12px;
            color: #2b164c;
            font-size: 1.05rem;
        }

        .pp-timeline-lista {
            display: grid;
            gap: 10px;
        }

        .pp-timeline-item {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .pp-timeline-marcador {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            flex-shrink: 0;
        }

        .pp-timeline-item.concluido .pp-timeline-marcador {
            background: #6d28d9;
            color: #ffffff;
        }

        .pp-timeline-item.pendente .pp-timeline-marcador {
            background: #eee7f8;
            color: #9588a8;
        }

        .pp-timeline-info {
            display: flex;
            flex-direction: column;
        }

        .pp-timeline-info strong {
            color: #2b164c;
            font-size: 0.95rem;
        }

        .pp-timeline-info small {
            color: #7c738d;
            font-size: 0.78rem;
        }

        .pp-foto-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
        }

        .pp-foto-header small {
            color: #7c738d;
            font-size: 0.78rem;
        }

        .pp-foto-img {
            width: 100%;
            max-height: 420px;
            object-fit: cover;
            border-radius: 18px;
            display: block;
            background: #eee;
        }

        .pp-foto-download {
            display: block;
            text-align: center;
            margin-top: 12px;
            padding: 13px 16px;
            border-radius: 16px;
            background: #6d28d9;
            color: #ffffff !important;
            text-decoration: none;
            font-weight: 800;
        }

        .pp-foto-expira {
            margin: 10px 0 0;
            color: #7c738d;
            font-size: 0.82rem;
            text-align: center;
        }

        .pp-observacao-card p {
            margin: 0;
            color: #4c435d;
            line-height: 1.45;
            font-size: 0.95rem;
        }

        .pp-estado {
            text-align: center;
            color: #5f5570;
        }

        .pp-estado h3 {
            margin: 0 0 8px;
            color: #2b164c;
        }

        .pp-estado p {
            margin: 0;
        }

        .pp-erro {
            border: 1px solid #ffd1d1;
            background: #fff7f7;
        }

        @media (max-width: 600px) {
            .pp-acompanhamento-card {
                margin: 14px auto;
                padding: 14px;
                border-radius: 22px;
            }

            .pp-status-principal {
                padding: 15px;
            }

            .pp-status-conteudo strong {
                font-size: 1.25rem;
            }

            .pp-foto-header {
                align-items: flex-start;
                flex-direction: column;
            }
        }
    `;

    document.head.appendChild(style);
}
