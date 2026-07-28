// =====================================================================
//           VITRINE.JS - O Maestro da Aplicação
//           PRONTI PET - Revisado com Pets, Fila, Assinaturas e Agendamento
// =====================================================================

// --- MÓDULOS IMPORTADOS ---
import {
    state,
    setEmpresa,
    setProfissionais,
    setTodosOsServicos,
    setAgendamento,
    resetarAgendamento,
    setCurrentUser,
    setClienteId,
    getClienteIdAtivo
} from './vitrini-state.js';

import {
    getEmpresaIdFromURL,
    getDadosEmpresa,
    getProfissionaisDaEmpresa,
    getHorariosDoProfissional,
    getTodosServicosDaEmpresa
} from './vitrini-profissionais.js';

import {
    buscarAgendamentosDoDia,
    calcularSlotsDisponiveis,
    salvarAgendamento,
    buscarAgendamentosDoCliente,
    cancelarAgendamento,
    encontrarPrimeiraDataComSlots
} from './vitrini-agendamento.js';

import {
    setupAuthListener,
    fazerLogin,
    fazerLogout
} from './vitrini-auth.js';

import * as UI from './vitrini-ui.js';

// --- PRONTI PET ---
import {
    garantirPetParaAgendamento,
    obterPrecoDuracaoPorPet
} from './vitrine-pets.js';

// --- FIREBASE / PROMOÇÕES / FILA ---
import { db, auth } from './vitrini-firebase.js';

import {
    collection,
    query,
    where,
    getDocs,
    limit,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- ASSINATURAS ---
import {
    marcarServicosInclusosParaUsuario
} from './vitrine-assinatura-integration.js';

// =====================================================================
// UTILITÁRIOS
// =====================================================================

function parseDataISO(dateStr) {
    if (!dateStr) return null;

    if (dateStr.includes('-')) {
        return new Date(dateStr + "T00:00:00");
    }

    if (dateStr.includes('/')) {
        const [dia, mes, ano] = dateStr.split('/');
        return new Date(`${ano}-${mes}-${dia}T00:00:00`);
    }

    return new Date(dateStr);
}

function calcularPrecoServico(servico) {
    if (!servico) return 0;

    if (servico.precoCobrado === 0) {
        return 0;
    }

    if (servico.promocao) {
        return Number(
            servico.promocao.precoComDesconto || 0
        );
    }

    return Number(servico.preco || 0);
}

function calcularDuracaoServico(servico) {
    return Number(servico?.duracao || 0);
}

// =====================================================================
// CLIENTE ATIVO / VINCULAÇÃO SEGURA
// =====================================================================

let promessaResolucaoCliente = null;
let dadosClienteAtivo = null;
let versaoAutenticacao = 0;

function normalizarEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function normalizarTelefone(telefone) {
    return String(telefone || "")
        .replace(/\D/g, "")
        .trim();
}

function obterUidVinculado(dadosCliente = {}) {
    return String(
        dadosCliente.authUid ||
        dadosCliente.clienteUid ||
        dadosCliente.userUid ||
        dadosCliente.uid ||
        ""
    ).trim();
}

function criarContextoCliente(
    user,
    clienteId = null
) {
    if (!user) return null;

    const idReal = String(
        clienteId ||
        state.clienteId ||
        user.uid ||
        ""
    ).trim();

    return {
        /*
         * O UID autenticado continua preservado
         * para compatibilidade com notificações.
         */
        uid: user.uid,
        authUid: user.uid,

        /*
         * ID verdadeiro do documento do cliente.
         */
        clienteId: idReal,

        displayName:
            dadosClienteAtivo?.nome ||
            user.displayName ||
            "Cliente",

        email:
            dadosClienteAtivo?.email ||
            user.email ||
            "",

        photoURL:
            user.photoURL ||
            dadosClienteAtivo?.fotoUrl ||
            ""
    };
}

async function consultarClientesPorCampo(
    clientesRef,
    campo,
    valor,
    obrigatoria = false
) {
    if (!valor) return [];

    try {
        const consulta = query(
            clientesRef,
            where(campo, "==", valor),
            limit(3)
        );

        const snapshot = await getDocs(consulta);

        return snapshot.docs;
    } catch (error) {
        console.warn(
            `[Vitrine] Não foi possível consultar clientes por ${campo}:`,
            error
        );

        if (obrigatoria) {
            const erroVinculacao = new Error(
                "Não foi possível verificar com segurança se já existe um cadastro para este e-mail. Revise as regras do Firestore antes de tentar novamente."
            );

            erroVinculacao.code =
                "cliente/vinculacao-nao-autorizada";

            erroVinculacao.cause = error;

            throw erroVinculacao;
        }

        return [];
    }
}

function selecionarClienteUnico(
    documentos = [],
    userUid,
    origemBusca
) {
    const unicos = new Map();

    documentos.forEach((docSnap) => {
        if (docSnap?.id) {
            unicos.set(
                docSnap.id,
                docSnap
            );
        }
    });

    const candidatos =
        [...unicos.values()];

    if (candidatos.length === 0) {
        return null;
    }

    const vinculadosAoMesmoUsuario =
        candidatos.filter((docSnap) => {
            const uidVinculado =
                obterUidVinculado(
                    docSnap.data()
                );

            return uidVinculado === userUid;
        });

    if (
        vinculadosAoMesmoUsuario.length === 1
    ) {
        return vinculadosAoMesmoUsuario[0];
    }

    if (
        vinculadosAoMesmoUsuario.length > 1
    ) {
        const error = new Error(
            `Foram encontrados vários cadastros vinculados à mesma conta durante a busca por ${origemBusca}.`
        );

        error.code =
            "cliente/vinculos-duplicados";

        throw error;
    }

    const semVinculo =
        candidatos.filter((docSnap) => {
            return !obterUidVinculado(
                docSnap.data()
            );
        });

    if (semVinculo.length === 1) {
        return semVinculo[0];
    }

    if (semVinculo.length > 1) {
        const error = new Error(
            "Existe mais de um cadastro manual com este e-mail. A vinculação automática foi interrompida para evitar unir a conta ao cliente errado."
        );

        error.code =
            "cliente/cadastros-duplicados";

        throw error;
    }

    const error = new Error(
        "Este cadastro já está vinculado a outra conta de acesso."
    );

    error.code =
        "cliente/email-ja-vinculado";

    throw error;
}

async function completarDocumentoCliente(
    clienteRef,
    clienteSnap,
    user,
    origemPadrao
) {
    const perfil =
        clienteSnap?.exists()
            ? clienteSnap.data()
            : {};

    const email =
        String(
            perfil.email ||
            user.email ||
            ""
        ).trim();

    const nome =
        String(
            perfil.nome ||
            user.displayName ||
            "Cliente"
        ).trim();

    const payload = {
        /*
         * Preserva os dados existentes.
         * Completa somente campos ausentes.
         */
        nome,
        email,

        emailNormalizado:
            normalizarEmail(
                email ||
                user.email
            ),

        /*
         * Campo canônico da vinculação.
         */
        authUid: user.uid,

        contaVinculada: true,

        atualizadoEm:
            serverTimestamp(),

        ultimoLoginEm:
            serverTimestamp()
    };

    if (!perfil.dataCadastro) {
        payload.dataCadastro =
            serverTimestamp();
    }

    if (!perfil.vinculadoEm) {
        payload.vinculadoEm =
            serverTimestamp();
    }

    if (!perfil.origemCadastro) {
        payload.origemCadastro =
            origemPadrao;
    }

    await setDoc(
        clienteRef,
        payload,
        {
            merge: true
        }
    );

    dadosClienteAtivo = {
        id: clienteRef.id,
        ...perfil,

        nome,
        email,

        emailNormalizado:
            payload.emailNormalizado,

        authUid: user.uid,
        contaVinculada: true,

        origemCadastro:
            perfil.origemCadastro ||
            origemPadrao
    };

    return clienteRef.id;
}

async function criarOuCompletarCliente(user) {
    if (
        !user?.uid ||
        !state.empresaId
    ) {
        throw new Error(
            "Não foi possível identificar o usuário ou a empresa."
        );
    }

    const clientesRef = collection(
        db,
        "empresarios",
        state.empresaId,
        "clientes"
    );

    /*
     * 1. Compatibilidade com clientes antigos:
     * primeiro verifica o documento cujo ID é o UID.
     */
    const clienteUidRef = doc(
        db,
        "empresarios",
        state.empresaId,
        "clientes",
        user.uid
    );

    const clienteUidSnap =
        await getDoc(clienteUidRef);

    if (clienteUidSnap.exists()) {
        return completarDocumentoCliente(
            clienteUidRef,
            clienteUidSnap,
            user,
            clienteUidSnap
                .data()
                ?.origemCadastro ||
            "vitrine"
        );
    }

    /*
     * 2. Procura um cadastro que já tenha sido
     * vinculado anteriormente pelo authUid.
     */
    const docsPorAuthUid =
        await consultarClientesPorCampo(
            clientesRef,
            "authUid",
            user.uid,
            false
        );

    const clienteJaVinculado =
        selecionarClienteUnico(
            docsPorAuthUid,
            user.uid,
            "authUid"
        );

    if (clienteJaVinculado) {
        const clienteRef = doc(
            db,
            "empresarios",
            state.empresaId,
            "clientes",
            clienteJaVinculado.id
        );

        return completarDocumentoCliente(
            clienteRef,
            clienteJaVinculado,
            user,
            clienteJaVinculado
                .data()
                ?.origemCadastro ||
            "manual"
        );
    }

    /*
     * 3. Procura cadastro manual pelo e-mail normalizado.
     *
     * Esta consulta é obrigatória para evitar a criação
     * de um cliente duplicado.
     */
    const emailNormalizado =
        normalizarEmail(user.email);

    let clientePorEmail = null;

    if (emailNormalizado) {
        const docsPorEmailNormalizado =
            await consultarClientesPorCampo(
                clientesRef,
                "emailNormalizado",
                emailNormalizado,
                true
            );

        clientePorEmail =
            selecionarClienteUnico(
                docsPorEmailNormalizado,
                user.uid,
                "emailNormalizado"
            );

        /*
         * Compatibilidade com cadastros antigos
         * que ainda não possuem emailNormalizado.
         */
        if (!clientePorEmail) {
            const docsPorEmail =
                await consultarClientesPorCampo(
                    clientesRef,
                    "email",
                    user.email,
                    true
                );

            clientePorEmail =
                selecionarClienteUnico(
                    docsPorEmail,
                    user.uid,
                    "email"
                );
        }
    }

    if (clientePorEmail) {
        const clienteRef = doc(
            db,
            "empresarios",
            state.empresaId,
            "clientes",
            clientePorEmail.id
        );

        return completarDocumentoCliente(
            clienteRef,
            clientePorEmail,
            user,
            clientePorEmail
                .data()
                ?.origemCadastro ||
            "manual"
        );
    }

    /*
     * 4. Nenhum cadastro existente encontrado.
     *
     * Mantém o comportamento antigo:
     * cria o cliente usando o UID como ID.
     */
    return completarDocumentoCliente(
        clienteUidRef,
        null,
        user,
        "vitrine"
    );
}

async function obterClienteIdResolvido() {
    if (
        !state.currentUser ||
        !state.empresaId
    ) {
        return null;
    }

    if (state.clienteId) {
        return state.clienteId;
    }

    if (!promessaResolucaoCliente) {
        promessaResolucaoCliente =
            criarOuCompletarCliente(
                state.currentUser
            );
    }

    const clienteId =
        await promessaResolucaoCliente;

    if (clienteId) {
        setClienteId(clienteId);
    }

    return clienteId || null;
}

function notificarClienteResolvido(
    clienteId,
    user
) {
    document.dispatchEvent(
        new CustomEvent(
            "pronti:cliente-resolvido",
            {
                detail: {
                    empresaId:
                        state.empresaId,

                    clienteId,

                    authUid:
                        user?.uid ||
                        null
                }
            }
        )
    );
}

// =====================================================================
// INICIALIZAÇÃO DA PÁGINA
// =====================================================================

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        try {
            UI.toggleLoader(true);

            const params =
                new URLSearchParams(
                    window.location.search
                );

            let empresaId =
                params.get('empresa');

            const slug =
                window.location.pathname
                    .substring(1);

            if (
                !empresaId &&
                slug &&
                slug !== 'vitrine.html' &&
                slug !== 'index.html' &&
                !slug.startsWith('r.html')
            ) {
                console.log(
                    `[Vitrine] ID não encontrado. Buscando empresa pelo slug: ${slug}`
                );

                const consultaEmpresa =
                    query(
                        collection(
                            db,
                            "empresarios"
                        ),
                        where(
                            "slug",
                            "==",
                            slug
                        ),
                        limit(1)
                    );

                const snapshot =
                    await getDocs(
                        consultaEmpresa
                    );

                if (!snapshot.empty) {
                    empresaId =
                        snapshot.docs[0].id;

                    console.log(
                        `[Vitrine] Empresa encontrada pelo slug. ID: ${empresaId}`
                    );
                }
            }

            if (!empresaId) {
                empresaId =
                    getEmpresaIdFromURL();

                if (!empresaId) {
                    throw new Error(
                        "ID da Empresa não pôde ser determinado a partir da URL."
                    );
                }
            }

            const [
                dados,
                profissionais,
                todosServicos
            ] = await Promise.all([
                getDadosEmpresa(
                    empresaId
                ),

                getProfissionaisDaEmpresa(
                    empresaId
                ),

                getTodosServicosDaEmpresa(
                    empresaId
                )
            ]);

            if (!dados) {
                throw new Error(
                    "Empresa não encontrada."
                );
            }

            setEmpresa(
                empresaId,
                dados
            );

            const logoPublico =
                document.getElementById(
                    "logo-publico"
                );

            if (logoPublico) {
                logoPublico.src =
                    dados.logoUrl ||
                    "https://placehold.co/100x100/eef2ff/4f46e5?text=Pet";
            }

            const nomePublico =
                document.getElementById(
                    "nome-negocio-publico"
                );

            if (nomePublico) {
                nomePublico.textContent =
                    dados.nomeFantasia ||
                    "Pet Shop";
            }

            setProfissionais(
                profissionais
            );

            setTodosOsServicos(
                todosServicos
            );

            await aplicarPromocoesNaVitrine(
                state.todosOsServicos,
                empresaId,
                null,
                true
            );

            try {
                await marcarServicosInclusosParaUsuario(
                    state.todosOsServicos,
                    empresaId
                );
            } catch (err) {
                console.info(
                    "Não foi possível verificar assinatura na carga inicial:",
                    err.message
                );
            }

            UI.renderizarDadosIniciaisEmpresa(
                state.dadosEmpresa,
                state.todosOsServicos
            );

            UI.renderizarProfissionais(
                state.listaProfissionais
            );

            await renderizarPlanosDeAssinatura(
                empresaId
            );

            configurarEventosGerais();

            setupAuthListener(
                handleUserAuthStateChange
            );

            UI.toggleLoader(false);

        } catch (error) {
            console.error(
                "Erro fatal na inicialização:",
                error.stack || error
            );

            const loader =
                document.getElementById(
                    "vitrine-loader"
                );

            if (loader) {
                loader.innerHTML = `
                    <p style="text-align:center;color:red;padding:20px;">
                        ${error.message}
                    </p>
                `;
            }
        }
    }
);

// =====================================================================
// PROMOÇÕES
// =====================================================================

async function aplicarPromocoesNaVitrine(
    listaServicos,
    empresaId,
    dataSelecionadaISO = null,
    forceNoPromo = false
) {
    if (
        !empresaId ||
        !Array.isArray(listaServicos)
    ) {
        return;
    }

    listaServicos.forEach(
        (servico) => {
            servico.promocao = null;
        }
    );

    if (
        forceNoPromo ||
        !dataSelecionadaISO
    ) {
        return;
    }

    const data =
        parseDataISO(
            dataSelecionadaISO
        );

    if (
        !data ||
        isNaN(data.getTime())
    ) {
        return;
    }

    const diaSemana =
        data.getDay();

    const promocoesRef =
        collection(
            db,
            "empresarios",
            empresaId,
            "precos_especiais"
        );

    const snapshot =
        await getDocs(
            promocoesRef
        );

    const promocoesAtivas = [];

    snapshot.forEach(
        (docSnap) => {
            const promo =
                docSnap.data();

            const dias =
                Array.isArray(
                    promo.diasSemana
                )
                    ? promo.diasSemana
                        .map(Number)
                    : [];

            if (
                promo.ativo &&
                dias.includes(
                    diaSemana
                )
            ) {
                promocoesAtivas.push({
                    id: docSnap.id,
                    ...promo
                });
            }
        }
    );

    listaServicos.forEach(
        (servico) => {
            let melhorPromocao = null;

            for (
                const promo
                of promocoesAtivas
            ) {
                if (
                    Array.isArray(
                        promo.servicoIds
                    ) &&
                    promo.servicoIds
                        .includes(servico.id)
                ) {
                    melhorPromocao =
                        promo;

                    break;
                }
            }

            if (!melhorPromocao) {
                melhorPromocao =
                    promocoesAtivas.find(
                        (promo) =>
                            promo.servicoIds == null ||
                            (
                                Array.isArray(
                                    promo.servicoIds
                                ) &&
                                promo.servicoIds
                                    .length === 0
                            )
                    );
            }

            if (melhorPromocao) {
                const precoAntigo =
                    Number(
                        servico.preco || 0
                    );

                let precoNovo =
                    precoAntigo;

                if (precoAntigo <= 0) {
                    return;
                }

                if (
                    melhorPromocao
                        .tipoDesconto ===
                    "percentual"
                ) {
                    precoNovo =
                        precoAntigo *
                        (
                            1 -
                            Number(
                                melhorPromocao
                                    .valor || 0
                            ) /
                            100
                        );
                } else if (
                    melhorPromocao
                        .tipoDesconto ===
                    "valorFixo"
                ) {
                    precoNovo =
                        Math.max(
                            precoAntigo -
                            Number(
                                melhorPromocao
                                    .valor || 0
                            ),
                            0
                        );
                }

                servico.promocao = {
                    nome:
                        melhorPromocao.nome,

                    precoOriginal:
                        precoAntigo,

                    precoComDesconto:
                        precoNovo,

                    tipoDesconto:
                        melhorPromocao
                            .tipoDesconto,

                    valorDesconto:
                        melhorPromocao.valor
                };
            }
        }
    );
}

// =====================================================================
// PLANOS DE ASSINATURA
// =====================================================================

async function renderizarPlanosDeAssinatura(
    empresaId
) {
    const planosDiv =
        document.getElementById(
            'lista-de-planos'
        );

    if (!planosDiv) {
        console.warn(
            "Elemento 'lista-de-planos' não encontrado para renderizar planos."
        );

        return;
    }

    planosDiv.innerHTML =
        '<p style="text-align:center;">Carregando planos...</p>';

    try {
        const planosRef =
            collection(
                db,
                `empresarios/${empresaId}/planosDeAssinatura`
            );

        const snapshot =
            await getDocs(planosRef);

        if (snapshot.empty) {
            planosDiv.innerHTML =
                '<p>Nenhum plano disponível no momento.</p>';

            return;
        }

        planosDiv.innerHTML = '';

        snapshot.forEach(
            (docSnap) => {
                const plano =
                    docSnap.data();

                const planoId =
                    docSnap.id;

                if (!plano.ativo) {
                    return;
                }

                const precoFormatado =
                    Number(
                        plano.preco || 0
                    ).toLocaleString(
                        'pt-BR',
                        {
                            style:
                                'currency',

                            currency:
                                'BRL'
                        }
                    );

                const servicosHTML =
                    Array.isArray(
                        plano.servicosInclusos
                    )
                        ? plano
                            .servicosInclusos
                            .map(
                                (servico) =>
                                    `<li>${servico.quantidade}x ${servico.nomeServico}</li>`
                            )
                            .join('')
                        : '';

                const card =
                    document.createElement(
                        'div'
                    );

                card.className =
                    'card-plano-vitrine';

                card.style = `
                    background:#fff;
                    border-radius:14px;
                    box-shadow:0 4px 18px rgba(99,102,241,0.06);
                    margin:18px 0;
                    padding:22px;
                    text-align:center;
                    color:#333;
                `;

                card.innerHTML = `
                    <h3 style="color:#4f46e5;">
                        ${plano.nome || "Plano"}
                    </h3>

                    <p
                        class="preco"
                        style="color:#6366f1;font-weight:bold;font-size:1.2em;"
                    >
                        ${precoFormatado} / mês
                    </p>

                    <p>
                        ${plano.descricao || ''}
                    </p>

                    <ul style="list-style:'✓ ';padding-left:20px;text-align:left;">
                        ${servicosHTML}
                    </ul>

                    <button
                        class="btn-assinar-plano"
                        style="background:linear-gradient(90deg,#6366f1 0%,#4f46e5 100%);color:#fff;border:none;border-radius:8px;padding:8px 22px;margin-top:14px;font-size:1em;cursor:pointer;"
                    >
                        Assinar
                    </button>
                `;

                card
                    .querySelector(
                        '.btn-assinar-plano'
                    )
                    .addEventListener(
                        'click',
                        () => {
                            window.location.href =
                                `vitrine-assinatura.html?empresaId=${encodeURIComponent(empresaId)}&planoId=${encodeURIComponent(planoId)}`;
                        }
                    );

                planosDiv.appendChild(
                    card
                );
            }
        );

    } catch (err) {
        console.error(
            "Erro ao carregar planos de assinatura:",
            err
        );

        planosDiv.innerHTML =
            '<p style="color:red;">Ocorreu um erro ao carregar os planos.</p>';
    }
}

// =====================================================================
// EVENTOS GERAIS
// =====================================================================

function configurarEventosGerais() {
    const addSafeListener = (
        selector,
        event,
        handler,
        isQuerySelector = false
    ) => {
        const element =
            isQuerySelector
                ? document.querySelector(
                    selector
                )
                : document.getElementById(
                    selector
                );

        if (element) {
            element.addEventListener(
                event,
                handler
            );
        }
    };

    addSafeListener(
        '.sidebar-menu',
        'click',
        handleMenuClick,
        true
    );

    addSafeListener(
        '.bottom-nav-vitrine',
        'click',
        handleMenuClick,
        true
    );

    addSafeListener(
        'lista-profissionais',
        'click',
        handleProfissionalClick
    );

    addSafeListener(
        'lista-servicos',
        'click',
        handleServicoClick
    );

    addSafeListener(
        'btn-prosseguir-data',
        'click',
        handleProsseguirDataClick
    );

    addSafeListener(
        'data-agendamento',
        'change',
        handleDataChange
    );

    addSafeListener(
        'grade-horarios',
        'click',
        handleHorarioClick
    );

    addSafeListener(
        'btn-login',
        'click',
        fazerLogin
    );

    addSafeListener(
        'modal-auth-btn-google',
        'click',
        fazerLogin
    );

    addSafeListener(
        'btn-logout',
        'click',
        fazerLogout
    );

    addSafeListener(
        'btn-confirmar-agendamento',
        'click',
        handleConfirmarAgendamento
    );

    addSafeListener(
        'botoes-agendamento',
        'click',
        handleFiltroAgendamentos
    );

    addSafeListener(
        'lista-agendamentos-visualizacao',
        'click',
        handleCancelarClick
    );
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================

async function handleUserAuthStateChange(
    user
) {
    const versaoAtual =
        ++versaoAutenticacao;

    setCurrentUser(user);
    setClienteId(null);

    dadosClienteAtivo = null;
    promessaResolucaoCliente = null;

    UI.atualizarUIdeAuth(user);

    UI.toggleAgendamentoLoginPrompt(
        !user
    );

    if (
        user &&
        state.empresaId
    ) {
        promessaResolucaoCliente =
            criarOuCompletarCliente(
                user
            );

        try {
            const clienteId =
                await promessaResolucaoCliente;

            /*
             * Evita aplicar o resultado de uma
             * autenticação antiga caso o usuário
             * tenha saído ou trocado de conta.
             */
            if (
                versaoAtual !==
                    versaoAutenticacao ||
                auth.currentUser?.uid !==
                    user.uid
            ) {
                return;
            }

            setClienteId(
                clienteId
            );

            notificarClienteResolvido(
                clienteId,
                user
            );

            await atualizarAssinaturasDoCliente(
                clienteId
            );

        } catch (error) {
            console.error(
                "[Vitrine] Não foi possível resolver ou vincular o cliente:",
                error
            );

            setClienteId(null);

            document.dispatchEvent(
                new CustomEvent(
                    "pronti:cliente-resolucao-erro",
                    {
                        detail: {
                            empresaId:
                                state.empresaId,

                            authUid:
                                user.uid,

                            code:
                                error?.code ||
                                null,

                            message:
                                error?.message ||
                                "Falha ao identificar o cliente."
                        }
                    }
                )
            );
        }
    } else if (
        !user &&
        state.empresaId
    ) {
        limparAssinaturasLocais();
    }

    if (user) {
        if (
            document
                .getElementById(
                    "menu-visualizacao"
                )
                ?.classList
                .contains("ativo")
        ) {
            handleFiltroAgendamentos({
                target:
                    document.getElementById(
                        "btn-ver-ativos"
                    )
            });
        }
    } else {
        if (
            document
                .getElementById(
                    "menu-visualizacao"
                )
                ?.classList
                .contains("ativo")
        ) {
            if (
                UI.exibirMensagemDeLoginAgendamentos
            ) {
                UI.exibirMensagemDeLoginAgendamentos();
            }
        }
    }
}

async function atualizarAssinaturasDoCliente(
    clienteId = null
) {
    try {
        const idCliente =
            clienteId ||
            state.clienteId ||
            getClienteIdAtivo();

        await marcarServicosInclusosParaUsuario(
            state.todosOsServicos,
            state.empresaId,
            idCliente
        );

        if (
            document
                .getElementById(
                    "lista-servicos"
                )
                ?.offsetParent !== null
        ) {
            const servicosProfissional =
                state.todosOsServicos.filter(
                    (servico) =>
                        state.agendamento
                            ?.profissional
                            ?.servicos
                            ?.includes(
                                servico.id
                            )
                );

            UI.renderizarServicos(
                servicosProfissional,
                state.agendamento
                    ?.profissional
                    ?.horarios
                    ?.permitirAgendamentoMultiplo
            );

            state.agendamento
                ?.servicos
                ?.forEach(
                    (servico) =>
                        UI.selecionarCard(
                            "servico",
                            servico.id
                        )
                );

            if (
                state.agendamento
                    ?.profissional
                    ?.horarios
                    ?.permitirAgendamentoMultiplo
            ) {
                UI.atualizarResumoAgendamento(
                    state.agendamento
                        .servicos
                );
            } else {
                UI.atualizarResumoAgendamentoFinal();
            }
        }
    } catch (error) {
        console.info(
            "Não foi possível verificar assinatura após login:",
            error.message
        );
    }
}

function limparAssinaturasLocais() {
    state.todosOsServicos.forEach(
        (servico) => {
            servico.inclusoAssinatura =
                false;

            servico.fazParteDaAssinatura =
                false;

            servico.precoCobrado =
                undefined;

            servico.assinaturasCandidatas =
                undefined;
        }
    );

    if (
        document
            .getElementById(
                'lista-servicos'
            )
            ?.offsetParent !== null
    ) {
        const servicosProfissional =
            state.todosOsServicos.filter(
                (servico) =>
                    state.agendamento
                        ?.profissional
                        ?.servicos
                        ?.includes(
                            servico.id
                        )
            );

        UI.renderizarServicos(
            servicosProfissional,
            state.agendamento
                ?.profissional
                ?.horarios
                ?.permitirAgendamentoMultiplo
        );

        state.agendamento
            ?.servicos
            ?.forEach(
                (servico) =>
                    UI.selecionarCard(
                        'servico',
                        servico.id
                    )
            );

        if (
            state.agendamento
                ?.profissional
                ?.horarios
                ?.permitirAgendamentoMultiplo
        ) {
            UI.atualizarResumoAgendamento(
                state.agendamento.servicos
            );
        } else {
            UI.atualizarResumoAgendamentoFinal();
        }
    }
}

// =====================================================================
// MENU
// =====================================================================

function handleMenuClick(e) {
    const menuButton =
        e.target.closest(
            '[data-menu]'
        );

    if (!menuButton) return;

    const menuKey =
        menuButton.getAttribute(
            'data-menu'
        );

    UI.trocarAba(
        `menu-${menuKey}`
    );

    if (
        menuKey ===
        'visualizacao'
    ) {
        if (state.currentUser) {
            handleFiltroAgendamentos({
                target:
                    document.getElementById(
                        'btn-ver-ativos'
                    )
            });
        } else if (
            UI.exibirMensagemDeLoginAgendamentos
        ) {
            UI.exibirMensagemDeLoginAgendamentos();
        }
    }
}

// =====================================================================
// PROFISSIONAL
// =====================================================================

async function handleProfissionalClick(e) {
    const card =
        e.target.closest(
            '.card-profissional'
        );

    if (!card) return;

    resetarAgendamento();

    UI.limparSelecao(
        'servico'
    );

    UI.limparSelecao(
        'horario'
    );

    UI.desabilitarBotaoConfirmar();
    UI.mostrarContainerForm(false);
    UI.renderizarServicos([]);
    UI.renderizarHorarios([]);

    const profissionalId =
        card.dataset.id;

    const profissional =
        state.listaProfissionais.find(
            (item) =>
                item.id === profissionalId
        );

    if (!profissional) {
        await UI.mostrarAlerta(
            "Erro",
            "Profissional não encontrado."
        );

        return;
    }

    UI.selecionarCard(
        'profissional',
        profissionalId,
        true
    );

    try {
        profissional.horarios =
            await getHorariosDoProfissional(
                state.empresaId,
                profissionalId
            );

        setAgendamento(
            'profissional',
            profissional
        );

        const permiteMultiplos =
            profissional.horarios
                ?.permitirAgendamentoMultiplo ||
            false;

        const servicosDoProfissional =
            (
                profissional.servicos ||
                []
            )
                .map(
                    (servicoId) =>
                        state.todosOsServicos
                            .find(
                                (servico) =>
                                    servico.id ===
                                    servicoId
                            )
                )
                .filter(Boolean);

        try {
            await marcarServicosInclusosParaUsuario(
                servicosDoProfissional,
                state.empresaId,
                state.clienteId
            );
        } catch (err) {
            console.info(
                "Não foi possível verificar assinatura ao selecionar profissional:",
                err.message
            );
        }

        UI.mostrarContainerForm(
            true
        );

        UI.renderizarServicos(
            servicosDoProfissional,
            permiteMultiplos
        );

        UI.configurarModoAgendamento(
            permiteMultiplos
        );

    } catch (error) {
        console.error(
            "Erro ao buscar horários do profissional:",
            error
        );

        await UI.mostrarAlerta(
            "Erro",
            "Não foi possível carregar os dados deste profissional."
        );

    } finally {
        UI.selecionarCard(
            'profissional',
            profissionalId,
            false
        );
    }
}

// =====================================================================
// SERVIÇO - PRONTI PET
// =====================================================================

async function handleServicoClick(e) {
    const card =
        e.target.closest(
            '.card-servico'
        );

    if (!card) return;

    if (
        !state.agendamento.profissional
    ) {
        await UI.mostrarAlerta(
            "Atenção",
            "Por favor, selecione um profissional antes de escolher um serviço."
        );

        return;
    }

    if (!state.currentUser) {
        await UI.mostrarAlerta(
            "Login Necessário",
            "Você precisa fazer login para escolher um serviço."
        );

        if (UI.abrirModalLogin) {
            UI.abrirModalLogin();
        }

        return;
    }

    let clienteId;

    try {
        clienteId =
            await obterClienteIdResolvido();
    } catch (error) {
        console.error(
            "[Vitrine] Erro ao identificar cliente para o pet:",
            error
        );

        await UI.mostrarAlerta(
            "Cadastro não identificado",
            error.message ||
            "Não foi possível identificar seu cadastro com segurança."
        );

        return;
    }

    if (!clienteId) {
        await UI.mostrarAlerta(
            "Cadastro não identificado",
            "Não foi possível identificar o cadastro do cliente."
        );

        return;
    }

    const pet =
        await garantirPetParaAgendamento(
            state.empresaId,
            clienteId
        );

    if (!pet) {
        await UI.mostrarAlerta(
            "Atenção",
            "Cadastre ou selecione um pet para continuar."
        );

        return;
    }

    const permiteMultiplos =
        state.agendamento
            .profissional
            .horarios
            ?.permitirAgendamentoMultiplo ||
        false;

    const servicoId =
        card.dataset.id;

    const servicoOriginal =
        state.todosOsServicos.find(
            (servico) =>
                servico.id === servicoId
        );

    if (!servicoOriginal) {
        await UI.mostrarAlerta(
            "Erro",
            "Serviço não encontrado."
        );

        return;
    }

    const precoDuracao =
        obterPrecoDuracaoPorPet(
            servicoOriginal,
            pet
        );

    const servicoSelecionado = {
        ...servicoOriginal,

        petId:
            pet.id,

        petNome:
            pet.nome,

        petPorte:
            pet.porte,

        preco:
            Number(
                precoDuracao.preco || 0
            ),

        duracao:
            Number(
                precoDuracao.duracao || 0
            ),

        precoCobrado:
            Number(
                precoDuracao.preco || 0
            )
    };

    if (
        !servicoSelecionado.duracao ||
        servicoSelecionado.duracao <= 0
    ) {
        await UI.mostrarAlerta(
            "Atenção",
            "Este serviço ainda não possui duração cadastrada para o porte do pet selecionado."
        );

        return;
    }

    let servicosAtuais = [
        ...state.agendamento.servicos
    ];

    if (permiteMultiplos) {
        const index =
            servicosAtuais.findIndex(
                (servico) =>
                    servico.id ===
                    servicoId
            );

        if (index > -1) {
            servicosAtuais.splice(
                index,
                1
            );
        } else {
            servicosAtuais.push(
                servicoSelecionado
            );
        }

        card.classList.toggle(
            'selecionado'
        );
    } else {
        servicosAtuais = [
            servicoSelecionado
        ];

        UI.selecionarCard(
            'servico',
            servicoId
        );
    }

    setAgendamento(
        'pet',
        pet
    );

    setAgendamento(
        'servicos',
        servicosAtuais
    );

    setAgendamento(
        'data',
        null
    );

    setAgendamento(
        'horario',
        null
    );

    UI.limparSelecao(
        'horario'
    );

    UI.desabilitarBotaoConfirmar();

    if (permiteMultiplos) {
        UI.atualizarResumoAgendamento(
            servicosAtuais
        );
    } else {
        const containerDataHorario =
            document.getElementById(
                'data-e-horario-container'
            );

        if (containerDataHorario) {
            containerDataHorario
                .style
                .display =
                'block';
        }

        if (
            servicosAtuais.length > 0
        ) {
            await buscarPrimeiraDataDisponivel();
        }
    }
}

// =====================================================================
// DATA E HORÁRIOS
// =====================================================================

async function handleProsseguirDataClick() {
    const servicos =
        state.agendamento.servicos;

    if (
        !servicos ||
        servicos.length === 0
    ) {
        await UI.mostrarAlerta(
            "Atenção",
            "Selecione pelo menos um serviço para continuar."
        );

        return;
    }

    const container =
        document.getElementById(
            'data-e-horario-container'
        );

    if (container) {
        container.style.display =
            'block';
    }

    await buscarPrimeiraDataDisponivel();
}

async function buscarPrimeiraDataDisponivel() {
    UI.atualizarStatusData(
        true,
        'A procurar a data mais próxima com vagas...'
    );

    const duracaoTotal =
        state.agendamento
            .servicos
            .reduce(
                (total, servico) =>
                    total +
                    calcularDuracaoServico(
                        servico
                    ),
                0
            );

    try {
        const primeiraData =
            await encontrarPrimeiraDataComSlots(
                state.empresaId,
                state.agendamento
                    .profissional,
                duracaoTotal
            );

        const dataInput =
            document.getElementById(
                'data-agendamento'
            );

        if (
            primeiraData &&
            dataInput
        ) {
            dataInput.value =
                primeiraData;

            dataInput.disabled =
                false;

            dataInput.dispatchEvent(
                new Event('change')
            );
        } else {
            UI.renderizarHorarios(
                [],
                'Nenhuma data disponível para os serviços selecionados nos próximos 3 meses.'
            );

            UI.atualizarStatusData(
                false
            );
        }

    } catch (error) {
        console.error(
            "Erro ao encontrar data disponível:",
            error
        );

        await UI.mostrarAlerta(
            "Erro",
            "Ocorreu um problema ao verificar a disponibilidade."
        );

        UI.atualizarStatusData(
            false
        );
    }
}

async function handleDataChange(e) {
    setAgendamento(
        'data',
        e.target.value
    );

    setAgendamento(
        'horario',
        null
    );

    UI.limparSelecao(
        'horario'
    );

    UI.desabilitarBotaoConfirmar();

    const {
        profissional,
        servicos,
        data
    } = state.agendamento;

    const duracaoTotal =
        servicos.reduce(
            (total, servico) =>
                total +
                calcularDuracaoServico(
                    servico
                ),
            0
        );

    await aplicarPromocoesNaVitrine(
        state.todosOsServicos,
        state.empresaId,
        data,
        false
    );

    try {
        await marcarServicosInclusosParaUsuario(
            state.todosOsServicos,
            state.empresaId,
            state.clienteId
        );
    } catch (err) {
        console.info(
            "Não foi possível verificar assinatura ao mudar data:",
            err.message
        );
    }

    if (profissional) {
        const permiteMultiplos =
            profissional.horarios
                ?.permitirAgendamentoMultiplo ||
            false;

        const servicosDoProfissional =
            (
                profissional.servicos ||
                []
            )
                .map(
                    (servicoId) =>
                        state.todosOsServicos
                            .find(
                                (servico) =>
                                    servico.id ===
                                    servicoId
                            )
                )
                .filter(Boolean);

        UI.renderizarServicos(
            servicosDoProfissional,
            permiteMultiplos
        );

        state.agendamento
            .servicos
            .forEach(
                (servico) =>
                    UI.selecionarCard(
                        'servico',
                        servico.id
                    )
            );

        if (permiteMultiplos) {
            UI.atualizarResumoAgendamento(
                state.agendamento
                    .servicos
            );
        } else {
            UI.atualizarResumoAgendamentoFinal();
        }
    }

    if (
        !profissional ||
        duracaoTotal === 0 ||
        !data
    ) {
        return;
    }

    UI.renderizarHorarios(
        [],
        'A calcular horários...'
    );

    try {
        const todosAgendamentos =
            await buscarAgendamentosDoDia(
                state.empresaId,
                data
            );

        const agendamentosProfissional =
            todosAgendamentos.filter(
                (agendamento) =>
                    agendamento
                        .profissionalId ===
                    profissional.id
            );

        const slots =
            calcularSlotsDisponiveis(
                data,
                agendamentosProfissional,
                profissional.horarios,
                duracaoTotal
            );

        UI.renderizarHorarios(
            slots
        );

    } catch (error) {
        console.error(
            "Erro ao buscar agendamentos do dia:",
            error
        );

        UI.renderizarHorarios(
            [],
            'Erro ao carregar horários. Tente outra data.'
        );
    }
}

function handleHorarioClick(e) {
    const btn =
        e.target.closest(
            '.btn-horario'
        );

    if (
        !btn ||
        btn.disabled
    ) {
        return;
    }

    setAgendamento(
        'horario',
        btn.dataset.horario
    );

    UI.selecionarCard(
        'horario',
        btn.dataset.horario
    );

    UI.atualizarResumoAgendamentoFinal();
    UI.habilitarBotaoConfirmar();
}

// =====================================================================
// CONFIRMAR AGENDAMENTO
// =====================================================================

async function handleConfirmarAgendamento() {
    if (!state.currentUser) {
        await UI.mostrarAlerta(
            "Login Necessário",
            "Você precisa fazer login para confirmar o agendamento."
        );

        if (UI.abrirModalLogin) {
            UI.abrirModalLogin();
        }

        return;
    }

    let clienteId;

    try {
        clienteId =
            await obterClienteIdResolvido();
    } catch (error) {
        console.error(
            "[Vitrine] Erro ao identificar cliente para o agendamento:",
            error
        );

        await UI.mostrarAlerta(
            "Cadastro não identificado",
            error.message ||
            "Não foi possível identificar seu cadastro com segurança."
        );

        return;
    }

    if (!clienteId) {
        await UI.mostrarAlerta(
            "Cadastro não identificado",
            "Não foi possível identificar o cadastro do cliente."
        );

        return;
    }

    const podeSeguir =
        await exigirCelularParaAgendamento(
            clienteId
        );

    if (!podeSeguir) {
        return;
    }

    const {
        profissional,
        servicos,
        data,
        horario,
        pet
    } = state.agendamento;

    if (
        !profissional ||
        !servicos ||
        servicos.length === 0 ||
        !data ||
        !horario
    ) {
        await UI.mostrarAlerta(
            "Informação Incompleta",
            "Por favor, selecione profissional, serviço(s), data e horário."
        );

        return;
    }

    const btn =
        document.getElementById(
            'btn-confirmar-agendamento'
        );

    const textoOriginal =
        btn
            ? btn.textContent
            : "Confirmar Agendamento";

    if (btn) {
        btn.disabled = true;
        btn.textContent =
            'A agendar...';
    }

    try {
        const precoTotalCalculado =
            servicos.reduce(
                (total, servico) =>
                    total +
                    calcularPrecoServico(
                        servico
                    ),
                0
            );

        const duracaoTotalCalculada =
            servicos.reduce(
                (total, servico) =>
                    total +
                    calcularDuracaoServico(
                        servico
                    ),
                0
            );

        const servicoParaSalvar = {
            id:
                servicos
                    .map(
                        (servico) =>
                            servico.id
                    )
                    .join(','),

            nome:
                servicos
                    .map(
                        (servico) =>
                            servico.nome
                    )
                    .join(' + '),

            duracao:
                duracaoTotalCalculada,

            preco:
                precoTotalCalculado
        };

        const agendamentoParaSalvar = {
            profissional:
                state.agendamento
                    .profissional,

            data:
                state.agendamento.data,

            horario:
                state.agendamento.horario,

            servico:
                servicoParaSalvar,

            empresa:
                state.dadosEmpresa,

            pet: pet
                ? {
                    id:
                        pet.id ||
                        null,

                    nome:
                        pet.nome ||
                        "",

                    porte:
                        pet.porte ||
                        "",

                    raca:
                        pet.raca ||
                        "",

                    fotoUrl:
                        pet.fotoUrl ||
                        "",

                    fotoPath:
                        pet.fotoPath ||
                        "",

                    observacoes:
                        pet.observacoes ||
                        ""
                }
                : null
        };

        const contextoCliente =
            criarContextoCliente(
                state.currentUser,
                clienteId
            );

        /*
         * Mantém a assinatura atual da função.
         *
         * O contexto possui:
         * - uid: UID autenticado;
         * - clienteId: documento real.
         *
         * O próximo ajuste será no
         * vitrini-agendamento.js.
         */
        await salvarAgendamento(
            state.empresaId,
            contextoCliente,
            agendamentoParaSalvar
        );

        const nomeEmpresa =
            state.dadosEmpresa
                .nomeFantasia ||
            "A empresa";

        await UI.mostrarAlerta(
            "Agendamento Confirmado!",
            `${nomeEmpresa} agradece pelo seu agendamento.`
        );

        resetarAgendamento();

        UI.trocarAba(
            'menu-visualizacao'
        );

        requestAnimationFrame(
            () => {
                const btnAtivos =
                    document.getElementById(
                        'btn-ver-ativos'
                    );

                if (!btnAtivos) {
                    return;
                }

                btnAtivos
                    .classList
                    .add('ativo');

                handleFiltroAgendamentos({
                    target:
                        btnAtivos
                });
            }
        );

    } catch (error) {
        console.error(
            "Erro ao salvar agendamento:",
            error
        );

        await UI.mostrarAlerta(
            "Erro",
            `Não foi possível confirmar o agendamento. ${error.message}`
        );

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent =
                textoOriginal;
        }
    }
}

// =====================================================================
// AGENDAMENTOS DO CLIENTE
// =====================================================================

async function handleFiltroAgendamentos(e) {
    if (
        !e.target.matches(
            ".btn-toggle"
        ) ||
        !state.currentUser
    ) {
        return;
    }

    const modo =
        e.target.id ===
        "btn-ver-ativos"
            ? "ativos"
            : "historico";

    UI.selecionarFiltro(
        modo
    );

    UI.renderizarAgendamentosComoCards(
        [],
        "A buscar agendamentos..."
    );

    try {
        const clienteId =
            await obterClienteIdResolvido();

        if (!clienteId) {
            throw new Error(
                "Cliente não identificado."
            );
        }

        const contextoCliente =
            criarContextoCliente(
                state.currentUser,
                clienteId
            );

        const agendamentos =
            await buscarAgendamentosDoCliente(
                state.empresaId,
                contextoCliente,
                modo
            );

        UI.renderizarAgendamentosComoCards(
            agendamentos,
            modo
        );

    } catch (error) {
        console.error(
            "Erro ao buscar agendamentos do cliente:",
            error
        );

        await UI.mostrarAlerta(
            "Erro de Busca",
            error.message ||
            "Ocorreu um erro ao buscar os seus agendamentos."
        );

        UI.renderizarAgendamentosComoCards(
            [],
            "Não foi possível carregar os seus agendamentos."
        );
    }
}

async function handleCancelarClick(e) {
    const btnCancelar =
        e.target.closest(
            '.btn-cancelar'
        );

    if (!btnCancelar) {
        return;
    }

    const agendamentoId =
        btnCancelar.dataset.id;

    const confirmou =
        await UI.mostrarConfirmacao(
            "Cancelar Agendamento",
            "Tem a certeza de que deseja cancelar este agendamento? Esta ação não pode ser desfeita."
        );

    if (!confirmou) {
        return;
    }

    btnCancelar.disabled = true;
    btnCancelar.textContent =
        "A cancelar...";

    try {
        await cancelarAgendamento(
            state.empresaId,
            agendamentoId
        );

        await UI.mostrarAlerta(
            "Sucesso",
            "Agendamento cancelado com sucesso!"
        );

        handleFiltroAgendamentos({
            target:
                document.querySelector(
                    '#botoes-agendamento .btn-toggle.ativo'
                )
        });

    } catch (error) {
        console.error(
            "Erro ao cancelar agendamento:",
            error
        );

        await UI.mostrarAlerta(
            "Erro",
            `Não foi possível cancelar o agendamento. ${error.message}`
        );

        btnCancelar.disabled = false;
        btnCancelar.textContent =
            "Cancelar";
    }
}

// =====================================================================
// FILA DE ESPERA
// =====================================================================

async function entrarNaFilaDeAgendamento() {
    const user =
        auth.currentUser;

    if (!user) {
        await UI.mostrarAlerta(
            "Login Necessário",
            "Você precisa estar logado para entrar na fila de espera."
        );

        if (UI.abrirModalLogin) {
            UI.abrirModalLogin();
        }

        return;
    }

    const empresaId =
        state.empresaId;

    const profissional =
        state.agendamento
            .profissional;

    const pet =
        state.agendamento.pet ||
        null;

    const profissionalId =
        profissional?.id;

    const profissionalNome =
        profissional?.nome ||
        "Profissional";

    const dataSelecionada =
        state.agendamento.data;

    const servicosSelecionados =
        state.agendamento
            .servicos ||
        [];

    if (!empresaId) {
        await UI.mostrarAlerta(
            "Erro",
            "Empresa não identificada."
        );

        return;
    }

    if (!profissionalId) {
        await UI.mostrarAlerta(
            "Atenção",
            "Selecione um profissional antes de entrar na fila."
        );

        return;
    }

    if (
        !dataSelecionada ||
        servicosSelecionados
            .length === 0
    ) {
        await UI.mostrarAlerta(
            "Atenção",
            "Por favor, selecione os serviços e a data desejada antes de entrar na fila."
        );

        return;
    }

    let clienteId;

    try {
        clienteId =
            await obterClienteIdResolvido();
    } catch (error) {
        console.error(
            "[Vitrine] Erro ao identificar cliente para a fila:",
            error
        );

        await UI.mostrarAlerta(
            "Cadastro não identificado",
            error.message ||
            "Não foi possível identificar seu cadastro com segurança."
        );

        return;
    }

    if (!clienteId) {
        await UI.mostrarAlerta(
            "Cadastro não identificado",
            "Não foi possível identificar o cadastro do cliente."
        );

        return;
    }

    const contextoCliente =
        criarContextoCliente(
            user,
            clienteId
        );

    try {
        const filaRef =
            collection(
                db,
                "fila_agendamentos"
            );

        const servicosNormalizados =
            servicosSelecionados.map(
                (servico) => ({
                    id:
                        servico.id,

                    nome:
                        servico.nome,

                    duracao:
                        calcularDuracaoServico(
                            servico
                        ),

                    preco:
                        calcularPrecoServico(
                            servico
                        )
                })
            );

        const duracaoTotal =
            servicosNormalizados.reduce(
                (total, servico) =>
                    total +
                    Number(
                        servico.duracao ||
                        0
                    ),
                0
            );

        await addDoc(
            filaRef,
            {
                /*
                 * ID real do cadastro.
                 */
                clienteId,

                /*
                 * UID de autenticação preservado.
                 */
                clienteAuthUid:
                    user.uid,

                clienteNome:
                    contextoCliente
                        ?.displayName ||
                    user.displayName ||
                    "Cliente",

                clienteEmail:
                    contextoCliente
                        ?.email ||
                    user.email ||
                    null,

                empresaId,

                profissionalId,
                profissionalNome,

                pet: pet
                    ? {
                        id:
                            pet.id ||
                            null,

                        nome:
                            pet.nome ||
                            "",

                        porte:
                            pet.porte ||
                            ""
                    }
                    : null,

                servicos:
                    servicosNormalizados,

                duracaoTotal,

                dataFila:
                    dataSelecionada,

                status:
                    "aguardando",

                processando:
                    false,

                origem:
                    "vitrine",

                createdAt:
                    serverTimestamp(),

                criadoEm:
                    serverTimestamp()
            }
        );

        await UI.mostrarAlerta(
            "Fila de Espera",
            "Pronto! Você entrou na fila de espera. Se surgir uma vaga, avisaremos você."
        );

        const containerFila =
            document.getElementById(
                "container-fila-espera"
            );

        if (containerFila) {
            containerFila
                .style
                .display =
                "none";
        }

    } catch (error) {
        console.error(
            "Erro ao entrar na fila:",
            error
        );

        await UI.mostrarAlerta(
            "Erro",
            "Erro ao processar sua solicitação. Tente novamente."
        );
    }
}

window.entrarNaFilaDeAgendamento =
    entrarNaFilaDeAgendamento;

// =====================================================================
// TELEFONE DO CLIENTE
// =====================================================================

async function exigirCelularParaAgendamento(
    userOuClienteId
) {
    const clienteId =
        typeof userOuClienteId ===
        "string"
            ? userOuClienteId.trim()
            : String(
                userOuClienteId
                    ?.clienteId ||
                userOuClienteId
                    ?.uid ||
                ""
            ).trim();

    if (!clienteId) {
        return true;
    }

    const clienteRef = doc(
        db,
        "empresarios",
        state.empresaId,
        "clientes",
        clienteId
    );

    let perfil = {};

    try {
        const snapshot =
            await getDoc(
                clienteRef
            );

        perfil =
            snapshot.exists()
                ? snapshot.data()
                : {};

    } catch (error) {
        console.warn(
            "[Vitrine] Não foi possível ler o telefone do cliente:",
            error
        );

        perfil = {};
    }

    const telefoneSalvo =
        normalizarTelefone(
            perfil.telefone ||
            perfil.telefoneNormalizado ||
            ""
        );

    if (
        telefoneSalvo.length >= 9 &&
        telefoneSalvo.length <= 15
    ) {
        return true;
    }

    let telefone;

    while (true) {
        telefone =
            await pedirTelefoneModalPronti();

        if (telefone === null) {
            return false;
        }

        if (telefone === "skip") {
            return true;
        }

        if (!telefone) {
            continue;
        }

        telefone =
            normalizarTelefone(
                telefone
            );

        if (
            telefone.length >= 9 &&
            telefone.length <= 15
        ) {
            break;
        }
    }

    await setDoc(
        clienteRef,
        {
            telefone,

            telefoneNormalizado:
                telefone,

            atualizadoEm:
                serverTimestamp()
        },
        {
            merge: true
        }
    );

    if (dadosClienteAtivo) {
        dadosClienteAtivo.telefone =
            telefone;

        dadosClienteAtivo
            .telefoneNormalizado =
            telefone;
    }

    return true;
}

function pedirTelefoneModalPronti() {
    return new Promise(
        (resolve) => {
            const modal =
                document.getElementById(
                    "modal-telefone-pronti"
                );

            const input =
                document.getElementById(
                    "modal-telefone-input"
                );

            const erro =
                document.getElementById(
                    "modal-telefone-erro"
                );

            const btnOk =
                document.getElementById(
                    "modal-telefone-ok"
                );

            const btnCancelar =
                document.getElementById(
                    "modal-telefone-cancelar"
                );

            const btnSkip =
                document.getElementById(
                    "modal-telefone-seguir-sem"
                );

            if (
                !modal ||
                !input ||
                !btnOk ||
                !btnCancelar ||
                !btnSkip
            ) {
                console.error(
                    "Modal de telefone não encontrado no DOM"
                );

                resolve("skip");
                return;
            }

            modal.style.display =
                "flex";

            input.value = "";

            erro.style.display =
                "none";

            setTimeout(
                () => input.focus(),
                100
            );

            function confirmar() {
                const val =
                    input.value
                        .replace(
                            /\D/g,
                            ""
                        );

                if (val.length < 9) {
                    erro.textContent =
                        "Telefone inválido. Informe com DDD.";

                    erro.style.display =
                        "block";

                    input.focus();

                    return;
                }

                fechar(val);
            }

            function cancelar() {
                fechar(null);
            }

            function skip() {
                fechar("skip");
            }

            function fechar(retorno) {
                modal.style.display =
                    "none";

                btnOk.onclick =
                    null;

                btnCancelar.onclick =
                    null;

                btnSkip.onclick =
                    null;

                input.onkeydown =
                    null;

                modal.onmousedown =
                    null;

                window.removeEventListener(
                    "keydown",
                    escHandler
                );

                resolve(retorno);
            }

            function enterHandler(ev) {
                if (
                    ev.key === "Enter"
                ) {
                    confirmar();
                }
            }

            function escHandler(ev) {
                if (
                    ev.key === "Escape"
                ) {
                    cancelar();
                }
            }

            btnOk.onclick =
                confirmar;

            btnCancelar.onclick =
                cancelar;

            btnSkip.onclick =
                skip;

            input.onkeydown =
                enterHandler;

            modal.onmousedown =
                (ev) => {
                    if (
                        ev.target ===
                        modal
                    ) {
                        cancelar();
                    }
                };

            window.addEventListener(
                "keydown",
                escHandler
            );
        }
    );
}

// =====================================================================
// SALVAR LOGO NO CELULAR
// =====================================================================

window.salvarSalaoPronti =
    async function () {
        const img =
            document.getElementById(
                "logo-empresa"
            );

        if (!img) {
            console.warn(
                "Elemento #logo-empresa não encontrado no HTML"
            );

            alert(
                "Erro: logo não encontrada na tela."
            );

            return;
        }

        const src =
            img.src ||
            img.getAttribute(
                "src"
            );

        if (
            !src ||
            src.trim() === ""
        ) {
            alert(
                "A logo ainda não carregou. Aguarde um pouco e tente novamente."
            );

            return;
        }

        try {
            const response =
                await fetch(src);

            const blob =
                await response.blob();

            const url =
                window.URL
                    .createObjectURL(
                        blob
                    );

            const link =
                document.createElement(
                    "a"
                );

            link.href = url;

            link.download =
                "logo-salao.png";

            document.body
                .appendChild(link);

            link.click();

            document.body
                .removeChild(link);

            window.URL
                .revokeObjectURL(url);

        } catch (error) {
            console.warn(
                "Download direto falhou, abrindo imagem...",
                error
            );

            window.open(
                src,
                "_blank"
            );
        }
    };

