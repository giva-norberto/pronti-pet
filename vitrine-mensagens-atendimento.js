/*
=========================================================
 PRONTI PET — vitrine-mensagens-atendimento.js
=========================================================

Módulo de mensagens do atendimento — lado do cliente.

Responsabilidades:
- Escutar mensagens do atendimento em tempo real.
- Exibir um card grande e obrigatório.
- Impedir fechamento antes da confirmação.
- Marcar a mensagem como visualizada.
- Confirmar quando o cliente clicar em:
  "OK, ESTOU CIENTE".
- Atualizar o Firestore imediatamente para o Pet Shop.

Estrutura no Firestore:
empresarios/{empresaId}/agendamentos/{agendamentoId}/mensagens/{mensagemId}

Importante:
- Este módulo não registra push.
- O push com a vitrine fechada será integrado depois em:
  messaging.js
  firebase-messaging-sw.js
  Cloud Functions

Firebase Web SDK: 10.13.2
=========================================================
*/

import {
    collection,
    doc,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const STATUS = Object.freeze({
    ENVIADA: "enviada",
    VISUALIZADA: "visualizada",
    CONFIRMADA: "confirmada",
    CANCELADA: "cancelada"
});

const ID_OVERLAY = "pp-mensagem-atendimento-overlay";
const ID_CSS = "pp-vitrine-mensagens-atendimento-css";

let cancelarListenerAtual = null;
let contextoAtual = null;
let mensagemExibidaId = null;
let confirmacaoEmAndamento = false;

// Suporte a dois ou mais pets com atendimentos simultâneos.
const canceladoresMensagensPorAtendimento = new Map();
const mensagensPorAtendimento = new Map();
let contextoMensagensMultiplas = null;

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

/**
 * Inicia a escuta das mensagens de um atendimento.
 *
 * @param {Object} params
 * @param {Object} params.db Instância do Firestore.
 * @param {string} params.empresaId
 * @param {string} params.agendamentoId
 * @param {string} params.clienteId UID ou ID do cliente autenticado.
 * @param {string} [params.clienteNome]
 * @param {Function} [params.aoConfirmar]
 * @param {Function} [params.aoErro]
 * @returns {Function} função para encerrar o listener
 */
export function iniciarMensagensAtendimentoCliente({
    db,
    empresaId,
    agendamentoId,
    clienteId,
    clienteNome = "Cliente",
    aoConfirmar,
    aoErro
}) {
    validarInicializacao({
        db,
        empresaId,
        agendamentoId,
        clienteId
    });

    encerrarMensagensAtendimentoCliente();
    aplicarCssMensagensAtendimento();

    contextoAtual = {
        db,
        empresaId,
        agendamentoId,
        clienteId,
        clienteNome: limparTexto(clienteNome) || "Cliente",
        aoConfirmar:
            typeof aoConfirmar === "function" ? aoConfirmar : null,
        aoErro:
            typeof aoErro === "function" ? aoErro : null
    };

    const mensagensRef = collection(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId,
        "mensagens"
    );

    cancelarListenerAtual = onSnapshot(
        mensagensRef,
        async (snapshot) => {
            try {
                const mensagens = snapshot.docs
                    .map((documento) => ({
                        id: documento.id,
                        ...documento.data()
                    }))
                    .filter(mensagemDeveAparecer)
                    .sort(ordenarMensagens);

                const mensagemPrioritaria = mensagens[0] || null;

                if (!mensagemPrioritaria) {
                    removerCardMensagem();
                    return;
                }

                await exibirMensagemObrigatoria(mensagemPrioritaria);
            } catch (erro) {
                tratarErro(
                    "Erro ao processar mensagens do atendimento.",
                    erro
                );
            }
        },
        (erro) => {
            tratarErro(
                "Erro ao acompanhar mensagens do atendimento.",
                erro
            );
        }
    );

    return encerrarMensagensAtendimentoCliente;
}

/**
 * Encerra o listener atual e remove o card da tela.
 */
export function encerrarMensagensAtendimentoCliente() {
    if (typeof cancelarListenerAtual === "function") {
        cancelarListenerAtual();
    }

    cancelarListenerAtual = null;
    contextoAtual = null;
    mensagemExibidaId = null;
    confirmacaoEmAndamento = false;

    removerCardMensagem();
}

/* =====================================================
   MÚLTIPLOS ATENDIMENTOS SIMULTÂNEOS
===================================================== */

/**
 * Sincroniza os listeners das mensagens de todos os atendimentos ativos.
 * Mantém um listener por agendamento e exibe apenas a mensagem prioritária.
 *
 * @param {Object} params
 * @param {Object} params.db
 * @param {string} params.empresaId
 * @param {Array<Object>} params.atendimentos
 * @param {string} params.clienteId
 * @param {string} [params.clienteNome]
 * @param {Function} [params.aoConfirmar]
 * @param {Function} [params.aoErro]
 */
export function sincronizarMensagensAtendimentosCliente({
    db,
    empresaId,
    atendimentos = [],
    clienteId,
    clienteNome = "Cliente",
    aoConfirmar,
    aoErro
}) {
    if (!db || !empresaId || !clienteId) {
        encerrarMensagensAtendimentosCliente();
        return;
    }

    aplicarCssMensagensAtendimento();

    contextoMensagensMultiplas = {
        db,
        empresaId,
        clienteId,
        clienteNome: limparTexto(clienteNome) || "Cliente",
        aoConfirmar:
            typeof aoConfirmar === "function" ? aoConfirmar : null,
        aoErro:
            typeof aoErro === "function" ? aoErro : null
    };

    const idsDesejados = new Set(
        atendimentos
            .map((atendimento) =>
                limparTexto(atendimento?.id || atendimento?.agendamentoId)
            )
            .filter(Boolean)
    );

    for (const [agendamentoId, cancelar] of
        canceladoresMensagensPorAtendimento.entries()) {
        if (!idsDesejados.has(agendamentoId)) {
            try {
                cancelar();
            } catch (erro) {
                console.warn(
                    `Listener de mensagens ${agendamentoId} não encerrado:`,
                    erro
                );
            }

            canceladoresMensagensPorAtendimento.delete(agendamentoId);
            mensagensPorAtendimento.delete(agendamentoId);
        }
    }

    for (const agendamentoId of idsDesejados) {
        if (canceladoresMensagensPorAtendimento.has(agendamentoId)) {
            continue;
        }

        const mensagensRef = collection(
            db,
            "empresarios",
            empresaId,
            "agendamentos",
            agendamentoId,
            "mensagens"
        );

        const cancelar = onSnapshot(
            mensagensRef,
            (snapshot) => {
                const mensagens = snapshot.docs.map((documento) => ({
                    id: documento.id,
                    ...documento.data(),
                    _agendamentoId: agendamentoId,
                    _chaveExibicao: `${agendamentoId}:${documento.id}`
                }));

                mensagensPorAtendimento.set(
                    agendamentoId,
                    mensagens
                );

                renderizarMensagemPrioritariaMultipla();
            },
            (erro) => {
                console.error(
                    `Erro ao acompanhar mensagens de ${agendamentoId}:`,
                    erro
                );

                if (
                    typeof contextoMensagensMultiplas?.aoErro ===
                    "function"
                ) {
                    contextoMensagensMultiplas.aoErro(erro);
                }
            }
        );

        canceladoresMensagensPorAtendimento.set(
            agendamentoId,
            cancelar
        );
    }

    renderizarMensagemPrioritariaMultipla();
}

export function encerrarMensagensAtendimentosCliente() {
    for (const cancelar of
        canceladoresMensagensPorAtendimento.values()) {
        try {
            cancelar();
        } catch (erro) {
            console.warn(
                "Listener múltiplo de mensagens não encerrado:",
                erro
            );
        }
    }

    canceladoresMensagensPorAtendimento.clear();
    mensagensPorAtendimento.clear();
    contextoMensagensMultiplas = null;

    contextoAtual = null;
    mensagemExibidaId = null;
    confirmacaoEmAndamento = false;

    removerCardMensagem();
}

function renderizarMensagemPrioritariaMultipla() {
    if (!contextoMensagensMultiplas) {
        removerCardMensagem();
        return;
    }

    const mensagens = [
        ...mensagensPorAtendimento.values()
    ]
        .flat()
        .filter(mensagemDeveAparecer)
        .sort(ordenarMensagens);

    const mensagemPrioritaria = mensagens[0] || null;

    if (!mensagemPrioritaria) {
        removerCardMensagem();
        mensagemExibidaId = null;
        return;
    }

    contextoAtual = {
        ...contextoMensagensMultiplas,
        agendamentoId: mensagemPrioritaria._agendamentoId
    };

    exibirMensagemObrigatoria(mensagemPrioritaria).catch((erro) => {
        tratarErro(
            "Erro ao exibir mensagem prioritária do atendimento.",
            erro
        );
    });
}

/* =====================================================
   EXIBIÇÃO DO CARD
===================================================== */

async function exibirMensagemObrigatoria(mensagem) {
    if (!contextoAtual || !mensagem?.id) {
        return;
    }

    const chaveExibicao = mensagem._chaveExibicao || mensagem.id;
    const mudouMensagem = mensagemExibidaId !== chaveExibicao;

    if (mudouMensagem) {
        mensagemExibidaId = chaveExibicao;
        renderizarCardMensagem(mensagem);
    } else {
        atualizarCardMensagem(mensagem);
    }

    bloquearRolagemPagina(true);

    if (normalizarStatus(mensagem.status) === STATUS.ENVIADA) {
        await marcarMensagemComoVisualizada(mensagem);
    }
}

function renderizarCardMensagem(mensagem) {
    removerCardMensagem();

    const overlay = document.createElement("div");
    overlay.id = ID_OVERLAY;
    overlay.className = "pp-msg-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
        "aria-label",
        "Atualização importante do atendimento"
    );

    overlay.innerHTML = montarHtmlCard(mensagem);

    document.body.appendChild(overlay);

    configurarEventosCard(overlay, mensagem);
    focarBotaoConfirmacao();
}

function atualizarCardMensagem(mensagem) {
    const overlay = document.getElementById(ID_OVERLAY);

    if (!overlay) {
        renderizarCardMensagem(mensagem);
        return;
    }

    const statusEl = overlay.querySelector(
        "[data-pp-status-mensagem]"
    );

    if (statusEl) {
        statusEl.textContent = obterTextoStatus(mensagem.status);
    }
}

function montarHtmlCard(mensagem) {
    const titulo =
        limparTexto(mensagem.titulo) ||
        "Nova atualização do atendimento";

    const texto =
        limparTexto(mensagem.mensagem) ||
        "O Pet Shop enviou uma nova atualização.";

    const petNome =
        limparTexto(mensagem.petNome) ||
        "Seu pet";

    const servicoNome =
        limparTexto(mensagem.servicoNome) ||
        "";

    const fotoPet =
        limparTexto(mensagem.petFotoUrl) ||
        "";

    const horario = formatarDataHora(
        mensagem.enviadaEm || mensagem.criadaEm
    );

    return `
        <div class="pp-msg-card">
            <div class="pp-msg-topo">
                <span class="pp-msg-selo">
                    Atualização importante
                </span>

                <span
                    class="pp-msg-status"
                    data-pp-status-mensagem
                >
                    ${escaparHtml(obterTextoStatus(mensagem.status))}
                </span>
            </div>

            <div class="pp-msg-pet">
                <div class="pp-msg-foto">
                    ${
                        fotoPet
                            ? `
                                <img
                                    src="${escaparAtributo(fotoPet)}"
                                    alt="Foto de ${escaparAtributo(petNome)}"
                                >
                            `
                            : `<span aria-hidden="true">🐾</span>`
                    }
                </div>

                <div class="pp-msg-pet-dados">
                    <small>Mensagem sobre</small>
                    <strong>${escaparHtml(petNome)}</strong>
                    ${
                        servicoNome
                            ? `<span>${escaparHtml(servicoNome)}</span>`
                            : ""
                    }
                </div>
            </div>

            <div class="pp-msg-conteudo">
                <h2>${escaparHtml(titulo)}</h2>

                <p>${escaparHtml(texto)}</p>

                ${
                    horario
                        ? `<time>${escaparHtml(horario)}</time>`
                        : ""
                }
            </div>

            <div class="pp-msg-aviso">
                Este aviso só será fechado após sua confirmação.
                O Pet Shop receberá a confirmação imediatamente.
            </div>

            <button
                type="button"
                id="pp-msg-confirmar"
                class="pp-msg-confirmar"
            >
                OK, ESTOU CIENTE
            </button>

            <p
                id="pp-msg-retorno"
                class="pp-msg-retorno"
                aria-live="polite"
            ></p>
        </div>
    `;
}

function configurarEventosCard(overlay, mensagem) {
    const botao = overlay.querySelector("#pp-msg-confirmar");

    botao?.addEventListener("click", async () => {
        await confirmarMensagemCliente(mensagem);
    });

    overlay.addEventListener("click", (evento) => {
        if (evento.target === overlay) {
            destacarObrigatoriedade();
        }
    });

    document.addEventListener(
        "keydown",
        impedirFechamentoPorTeclado,
        true
    );
}

function impedirFechamentoPorTeclado(evento) {
    if (
        evento.key === "Escape" &&
        document.getElementById(ID_OVERLAY)
    ) {
        evento.preventDefault();
        evento.stopPropagation();
        destacarObrigatoriedade();
    }
}

function destacarObrigatoriedade() {
    const card = document.querySelector(
        `#${ID_OVERLAY} .pp-msg-card`
    );

    if (!card) return;

    card.classList.remove("pp-msg-alerta");
    void card.offsetWidth;
    card.classList.add("pp-msg-alerta");
}

function focarBotaoConfirmacao() {
    window.setTimeout(() => {
        document
            .getElementById("pp-msg-confirmar")
            ?.focus({ preventScroll: true });
    }, 80);
}

/* =====================================================
   VISUALIZAÇÃO
===================================================== */

async function marcarMensagemComoVisualizada(mensagem) {
    if (!contextoAtual || !mensagem?.id) {
        return;
    }

    const {
        db,
        empresaId,
        agendamentoId,
        clienteId,
        clienteNome
    } = contextoAtual;

    const mensagemRef = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId,
        "mensagens",
        mensagem.id
    );

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(mensagemRef);

            if (!snap.exists()) return;

            const dados = snap.data();
            const statusAtual = normalizarStatus(dados.status);

            if (
                statusAtual === STATUS.CONFIRMADA ||
                statusAtual === STATUS.CANCELADA ||
                statusAtual === STATUS.VISUALIZADA
            ) {
                return;
            }

            transaction.update(mensagemRef, {
                status: STATUS.VISUALIZADA,
                visualizadaEm: serverTimestamp(),
                visualizadaPor: clienteId,
                visualizadaPorNome: clienteNome
            });
        });

        window.dispatchEvent(
            new CustomEvent(
                "pronti-mensagem-atendimento-visualizada",
                {
                    detail: {
                        empresaId,
                        agendamentoId,
                        mensagemId: mensagem.id
                    }
                }
            )
        );
    } catch (erro) {
        tratarErro(
            "Não foi possível registrar a visualização da mensagem.",
            erro
        );
    }
}

/* =====================================================
   CONFIRMAÇÃO
===================================================== */

async function confirmarMensagemCliente(mensagem) {
    if (
        confirmacaoEmAndamento ||
        !contextoAtual ||
        !mensagem?.id
    ) {
        return;
    }

    confirmacaoEmAndamento = true;

    const botao = document.getElementById("pp-msg-confirmar");
    const retorno = document.getElementById("pp-msg-retorno");

    if (botao) {
        botao.disabled = true;
        botao.textContent = "CONFIRMANDO...";
    }

    if (retorno) {
        retorno.textContent = "";
    }

    const {
        db,
        empresaId,
        agendamentoId,
        clienteId,
        clienteNome,
        aoConfirmar
    } = contextoAtual;

    const mensagemRef = doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId,
        "mensagens",
        mensagem.id
    );

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(mensagemRef);

            if (!snap.exists()) {
                throw new Error("Mensagem não encontrada.");
            }

            const dados = snap.data();
            const statusAtual = normalizarStatus(dados.status);

            if (statusAtual === STATUS.CANCELADA) {
                throw new Error("Esta mensagem foi cancelada.");
            }

            if (statusAtual === STATUS.CONFIRMADA) {
                return;
            }

            transaction.update(mensagemRef, {
                status: STATUS.CONFIRMADA,
                confirmadaEm: serverTimestamp(),
                confirmadaPor: clienteId,
                confirmadaPorNome: clienteNome,
                visualizadaEm:
                    dados.visualizadaEm || serverTimestamp(),
                visualizadaPor:
                    dados.visualizadaPor || clienteId,
                visualizadaPorNome:
                    dados.visualizadaPorNome || clienteNome,
                ativa: false
            });
        });

        if (retorno) {
            retorno.textContent =
                "Confirmação enviada ao Pet Shop.";
        }

        window.dispatchEvent(
            new CustomEvent(
                "pronti-mensagem-atendimento-confirmada",
                {
                    detail: {
                        empresaId,
                        agendamentoId,
                        mensagemId: mensagem.id
                    }
                }
            )
        );

        if (typeof aoConfirmar === "function") {
            aoConfirmar({
                empresaId,
                agendamentoId,
                mensagemId: mensagem.id,
                mensagem
            });
        }

        await aguardar(650);

        removerCardMensagem();
        mensagemExibidaId = null;
    } catch (erro) {
        console.error(
            "Erro ao confirmar mensagem do atendimento:",
            erro
        );

        if (retorno) {
            retorno.textContent =
                "Não foi possível confirmar. Tente novamente.";
        }

        if (botao) {
            botao.disabled = false;
            botao.textContent = "TENTAR CONFIRMAR NOVAMENTE";
        }

        tratarErro(
            "Não foi possível confirmar a mensagem.",
            erro,
            false
        );
    } finally {
        confirmacaoEmAndamento = false;
    }
}

/* =====================================================
   FILTRO E ORDENAÇÃO
===================================================== */

function mensagemDeveAparecer(mensagem) {
    const status = normalizarStatus(mensagem?.status);

    if (mensagem?.ativa === false) return false;
    if (status === STATUS.CONFIRMADA) return false;
    if (status === STATUS.CANCELADA) return false;

    return Boolean(mensagem?.exigeConfirmacao);
}

function ordenarMensagens(a, b) {
    const prioridadeA = obterPrioridade(a);
    const prioridadeB = obterPrioridade(b);

    if (prioridadeA !== prioridadeB) {
        return prioridadeB - prioridadeA;
    }

    return obterMilissegundos(b.criadaEm) -
        obterMilissegundos(a.criadaEm);
}

function obterPrioridade(mensagem) {
    const tipo = limparTexto(mensagem?.tipo).toLowerCase();

    if (tipo === "urgente") return 4;
    if (tipo === "liberacao") return 3;
    if (tipo === "observacao") return 2;

    return 1;
}

/* =====================================================
   REMOÇÃO E LIMPEZA
===================================================== */

function removerCardMensagem() {
    const overlay = document.getElementById(ID_OVERLAY);

    if (overlay) {
        overlay.remove();
    }

    document.removeEventListener(
        "keydown",
        impedirFechamentoPorTeclado,
        true
    );

    bloquearRolagemPagina(false);
}

function bloquearRolagemPagina(bloquear) {
    const classe = "pp-msg-bloqueio-rolagem";

    document.documentElement.classList.toggle(
        classe,
        Boolean(bloquear)
    );

    document.body.classList.toggle(
        classe,
        Boolean(bloquear)
    );
}

/* =====================================================
   STATUS
===================================================== */

function obterTextoStatus(status) {
    const normalizado = normalizarStatus(status);

    if (normalizado === STATUS.CONFIRMADA) {
        return "Confirmada";
    }

    if (normalizado === STATUS.VISUALIZADA) {
        return "Visualizada";
    }

    if (normalizado === STATUS.CANCELADA) {
        return "Cancelada";
    }

    return "Nova mensagem";
}

function normalizarStatus(status) {
    const valor = limparTexto(status).toLowerCase();

    if (Object.values(STATUS).includes(valor)) {
        return valor;
    }

    return STATUS.ENVIADA;
}

/* =====================================================
   FORMATAÇÃO
===================================================== */

function formatarDataHora(valor) {
    const data = converterParaDate(valor);

    if (!data) return "";

    return data.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function converterParaDate(valor) {
    if (!valor) return null;

    if (valor instanceof Date) {
        return valor;
    }

    if (typeof valor?.toDate === "function") {
        return valor.toDate();
    }

    if (
        typeof valor === "string" ||
        typeof valor === "number"
    ) {
        const data = new Date(valor);

        return Number.isNaN(data.getTime())
            ? null
            : data;
    }

    return null;
}

function obterMilissegundos(valor) {
    const data = converterParaDate(valor);

    return data ? data.getTime() : 0;
}

/* =====================================================
   VALIDAÇÃO E ERROS
===================================================== */

function validarInicializacao({
    db,
    empresaId,
    agendamentoId,
    clienteId
}) {
    if (!db) {
        throw new Error("A instância do Firestore é obrigatória.");
    }

    if (!empresaId) {
        throw new Error("empresaId é obrigatório.");
    }

    if (!agendamentoId) {
        throw new Error("agendamentoId é obrigatório.");
    }

    if (!clienteId) {
        throw new Error("clienteId é obrigatório.");
    }
}

function tratarErro(mensagem, erro, notificarCallback = true) {
    console.error(mensagem, erro);

    if (
        notificarCallback &&
        typeof contextoAtual?.aoErro === "function"
    ) {
        contextoAtual.aoErro(erro);
    }
}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function limparTexto(valor) {
    return String(valor ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function escaparHtml(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escaparAtributo(texto) {
    return escaparHtml(texto);
}

function aguardar(milisegundos) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milisegundos);
    });
}

/* =====================================================
   CSS
===================================================== */

function aplicarCssMensagensAtendimento() {
    if (document.getElementById(ID_CSS)) {
        return;
    }

    const style = document.createElement("style");
    style.id = ID_CSS;

    style.textContent = `
        html.pp-msg-bloqueio-rolagem,
        body.pp-msg-bloqueio-rolagem {
            overflow: hidden !important;
            overscroll-behavior: none;
        }

        .pp-msg-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            box-sizing: border-box;
            background:
                radial-gradient(
                    circle at top,
                    rgba(56, 189, 248, 0.28),
                    transparent 42%
                ),
                rgba(2, 6, 23, 0.82);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
            overflow-y: auto;
        }

        .pp-msg-card {
            width: 100%;
            max-width: 520px;
            position: relative;
            overflow: hidden;
            background: #ffffff;
            border-radius: 30px;
            padding: 22px;
            box-sizing: border-box;
            border: 1px solid rgba(125, 211, 252, 0.55);
            box-shadow:
                0 28px 80px rgba(2, 6, 23, 0.42),
                0 0 0 8px rgba(255, 255, 255, 0.08);
            animation: ppMsgEntrada 0.28s ease-out;
            font-family: inherit;
        }

        .pp-msg-card::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 7px;
            background: linear-gradient(
                90deg,
                #7c3aed,
                #2563eb,
                #06b6d4
            );
        }

        .pp-msg-topo {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 4px 0 18px;
        }

        .pp-msg-selo {
            display: inline-flex;
            align-items: center;
            min-height: 30px;
            padding: 0 12px;
            border-radius: 999px;
            background: #ede9fe;
            color: #6d28d9;
            font-size: 0.74rem;
            font-weight: 950;
            letter-spacing: 0.035em;
            text-transform: uppercase;
        }

        .pp-msg-status {
            color: #0369a1;
            font-size: 0.78rem;
            font-weight: 900;
            white-space: nowrap;
        }

        .pp-msg-pet {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px;
            margin-bottom: 18px;
            background: linear-gradient(
                135deg,
                #f5f3ff,
                #eff6ff
            );
            border-radius: 22px;
            border: 1px solid #ddd6fe;
        }

        .pp-msg-foto {
            width: 72px;
            height: 72px;
            flex: 0 0 72px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 20px;
            background: #ffffff;
            border: 3px solid #ffffff;
            box-shadow: 0 8px 22px rgba(79, 70, 229, 0.18);
            font-size: 2rem;
        }

        .pp-msg-foto img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pp-msg-pet-dados {
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        .pp-msg-pet-dados small {
            color: #64748b;
            font-size: 0.72rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .pp-msg-pet-dados strong {
            color: #0f172a;
            font-size: 1.3rem;
            line-height: 1.18;
            font-weight: 950;
            overflow-wrap: anywhere;
        }

        .pp-msg-pet-dados span {
            color: #4f46e5;
            font-size: 0.88rem;
            font-weight: 850;
            margin-top: 3px;
            overflow-wrap: anywhere;
        }

        .pp-msg-conteudo {
            text-align: center;
        }

        .pp-msg-conteudo h2 {
            margin: 0 0 10px;
            color: #0f172a;
            font-size: 1.65rem;
            line-height: 1.18;
            font-weight: 950;
        }

        .pp-msg-conteudo p {
            margin: 0;
            color: #334155;
            font-size: 1.04rem;
            line-height: 1.55;
            font-weight: 700;
        }

        .pp-msg-conteudo time {
            display: block;
            margin-top: 12px;
            color: #64748b;
            font-size: 0.82rem;
            font-weight: 750;
        }

        .pp-msg-aviso {
            margin: 20px 0 14px;
            padding: 12px 14px;
            border-radius: 16px;
            background: #fff7ed;
            border: 1px solid #fed7aa;
            color: #9a3412;
            font-size: 0.82rem;
            line-height: 1.4;
            font-weight: 850;
            text-align: center;
        }

        .pp-msg-confirmar {
            width: 100%;
            min-height: 58px;
            border: 0;
            border-radius: 19px;
            padding: 15px 18px;
            background: linear-gradient(
                135deg,
                #7c3aed,
                #2563eb
            );
            color: #ffffff;
            font-size: 1rem;
            font-weight: 950;
            letter-spacing: 0.025em;
            cursor: pointer;
            box-shadow: 0 14px 30px rgba(79, 70, 229, 0.34);
            transition:
                transform 0.15s ease,
                box-shadow 0.15s ease,
                opacity 0.15s ease;
        }

        .pp-msg-confirmar:hover {
            transform: translateY(-1px);
            box-shadow: 0 18px 36px rgba(79, 70, 229, 0.4);
        }

        .pp-msg-confirmar:active {
            transform: scale(0.985);
        }

        .pp-msg-confirmar:focus-visible {
            outline: 4px solid rgba(56, 189, 248, 0.38);
            outline-offset: 3px;
        }

        .pp-msg-confirmar:disabled {
            opacity: 0.65;
            cursor: wait;
            transform: none;
        }

        .pp-msg-retorno {
            min-height: 22px;
            margin: 11px 0 0;
            color: #166534;
            text-align: center;
            font-size: 0.84rem;
            font-weight: 900;
        }

        .pp-msg-alerta {
            animation:
                ppMsgAlerta 0.36s ease,
                ppMsgEntrada 0s;
        }

        @keyframes ppMsgEntrada {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.97);
            }

            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes ppMsgAlerta {
            0%,
            100% {
                transform: translateX(0);
            }

            25% {
                transform: translateX(-7px);
            }

            50% {
                transform: translateX(7px);
            }

            75% {
                transform: translateX(-4px);
            }
        }

        @media (max-width: 600px) {
            .pp-msg-overlay {
                align-items: flex-end;
                padding: 10px;
            }

            .pp-msg-card {
                max-width: none;
                max-height: calc(100vh - 20px);
                overflow-y: auto;
                border-radius: 28px 28px 22px 22px;
                padding: 20px 17px 18px;
            }

            .pp-msg-topo {
                align-items: flex-start;
            }

            .pp-msg-selo {
                font-size: 0.67rem;
            }

            .pp-msg-pet {
                padding: 12px;
            }

            .pp-msg-foto {
                width: 64px;
                height: 64px;
                flex-basis: 64px;
                border-radius: 18px;
            }

            .pp-msg-pet-dados strong {
                font-size: 1.16rem;
            }

            .pp-msg-conteudo h2 {
                font-size: 1.42rem;
            }

            .pp-msg-conteudo p {
                font-size: 0.98rem;
            }

            .pp-msg-confirmar {
                min-height: 56px;
            }
        }
    `;

    document.head.appendChild(style);
}
