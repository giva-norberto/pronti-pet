import { db, auth } from './vitrini-firebase.js';
import { state } from './vitrini-state.js';

import {
    collection,
    query,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Utilitário: empresaId da URL ou localStorage
function obterEmpresaId() {
    let empresaId = null;

    try {
        const url = new URL(window.location.href);
        const empresaParam = url.searchParams.get('empresa');

        if (empresaParam) {
            empresaId = empresaParam;
            localStorage.setItem('empresaAtivaId', empresaId);
        }
    } catch {}

    if (!empresaId) {
        empresaId = localStorage.getItem('empresaAtivaId');
    }

    return empresaId;
}

// Utilitário: espera usuário pronto via Firebase Auth
function esperarUsuarioAutenticado() {
    return new Promise(resolve => {
        if (auth.currentUser) {
            return resolve(auth.currentUser);
        }

        const unsub = auth.onAuthStateChanged(user => {
            unsub();
            resolve(user);
        });
    });
}

/**
 * Retorna o ID real do documento do cliente.
 *
 * clienteId:
 * documento em empresarios/{empresaId}/clientes/{clienteId}
 *
 * uid:
 * identificação da conta no Firebase Authentication
 *
 * Para clientes antigos, o UID continua sendo usado como fallback.
 */
function resolverClienteId(user, clienteIdInformado = null) {
    const authUid = String(
        user?.uid ||
        auth.currentUser?.uid ||
        ""
    ).trim();

    const clienteIdEstado = String(
        state?.clienteId ||
        ""
    ).trim();

    const idRecebido = String(
        clienteIdInformado ||
        ""
    ).trim();

    // Caso já tenha sido passado um clienteId real, preserva o valor.
    if (
        idRecebido &&
        idRecebido !== authUid
    ) {
        return idRecebido;
    }

    // Prioridade para o documento real vinculado.
    return (
        clienteIdEstado ||
        idRecebido ||
        authUid
    );
}

/**
 * Painel: Mostra somente UMA assinatura por plano.
 * - Mostra ATIVA/VENCENDO; se não houver, mostra VENCIDA mais recente de cada plano.
 * - Nunca duplica o mesmo plano.
 */
export async function montarPainelMinhasAssinaturas(divAlvo) {
    divAlvo.innerHTML = "Carregando assinaturas...";

    const [empresaId, user] = await Promise.all([
        obterEmpresaId(),
        esperarUsuarioAutenticado()
    ]);

    if (!empresaId || !user) {
        divAlvo.innerHTML = "<p>Empresa ou usuário não definidos.</p>";
        return;
    }

    const clienteId = resolverClienteId(user);

    if (!clienteId) {
        divAlvo.innerHTML = "<p>Cadastro do cliente não identificado.</p>";
        return;
    }

    const assinaturasRef = collection(
        db,
        "empresarios",
        empresaId,
        "clientes",
        clienteId,
        "assinaturas"
    );

    const q = query(assinaturasRef);
    const snap = await getDocs(q);

    // Agrupa sempre a assinatura MAIS RECENTE para cada plano
    const porPlanoMaisRecente = {};

    snap.forEach(doc => {
        const a = doc.data();
        const planoId = a.planoId || a.planoNome;

        if (!planoId) return;

        let dataFimObj;

        if (
            a.dataFim &&
            a.dataFim.toDate
        ) {
            dataFimObj = a.dataFim.toDate();
        } else {
            // Valor antigo, se não tiver dataFim, para garantir ordenação
            dataFimObj = new Date(0);
        }

        // Só mantém a assinatura mais recente por plano
        if (
            !porPlanoMaisRecente[planoId] ||
            porPlanoMaisRecente[planoId].dataFimObj < dataFimObj
        ) {
            porPlanoMaisRecente[planoId] = {
                ...a,
                dataFimObj
            };
        }
    });

    // Para cada plano, escolhe somente UMA assinatura para mostrar
    const hoje = new Date();
    const assinaturasMostrar = [];

    Object.values(porPlanoMaisRecente).forEach(a => {
        let status = "VENCIDA";

        if (
            a.status === "ativo" &&
            a.dataFimObj &&
            a.dataFimObj > hoje
        ) {
            const diasRestantes =
                (a.dataFimObj - hoje) /
                (1000 * 60 * 60 * 24);

            if (diasRestantes <= 7) {
                status = "VENCENDO";
            } else {
                status = "ATIVA";
            }
        }

        assinaturasMostrar.push({
            ...a,
            status
        });
    });

    // Ordena: ativas/vencendo primeiro, depois vencidas
    assinaturasMostrar.sort((a, b) => {
        if (
            a.status === "VENCIDA" &&
            b.status !== "VENCIDA"
        ) {
            return 1;
        }

        if (
            b.status === "VENCIDA" &&
            a.status !== "VENCIDA"
        ) {
            return -1;
        }

        if (
            a.status === "VENCIDA" &&
            b.status === "VENCIDA"
        ) {
            // Vencidas: mais recente primeiro
            return b.dataFimObj - a.dataFimObj;
        }

        // Ativas/vencendo: mais próxima de vencer primeiro
        return a.dataFimObj - b.dataFimObj;
    });

    divAlvo.innerHTML = "";

    if (assinaturasMostrar.length === 0) {
        divAlvo.innerHTML = "<p>Você não possui assinaturas.</p>";
        return;
    }

    assinaturasMostrar.forEach(a => {
        let cardStyle = "";
        let statusHtml = `<b>${a.status}</b>`;

        if (a.status === "VENCENDO") {
            cardStyle =
                "border:2px solid #f59e42;background:#fffbea;";

            statusHtml =
                '<span style="color:#f59e42;font-weight:bold;">VENCENDO</span>';

        } else if (a.status === "VENCIDA") {
            cardStyle = "opacity:0.7;";

            statusHtml =
                '<b style="color:#e53e3e;">VENCIDA</b>';
        }

        const item = document.createElement("div");
        item.className = "card-assinatura";

        if (cardStyle) {
            item.setAttribute(
                "style",
                cardStyle
            );
        }

        item.innerHTML = `
            <b>${a.planoNome || a.planoId}</b><br>
            Status: ${statusHtml}<br>
            Validade até:
            <span>
                ${
                    a.dataFimObj
                        ? a.dataFimObj.toLocaleDateString("pt-BR")
                        : "---"
                }
            </span>
        `;

        divAlvo.appendChild(item);
    });
}

/**
 * CHECA SE O CLIENTE JÁ TEM ASSINATURA ATIVA OU VENCENDO DESSE PLANO.
 *
 * Compatibilidade:
 * - Pode receber diretamente o clienteId real.
 * - Caso receba o UID do Firebase Auth, utiliza state.clienteId.
 * - Para clientes antigos, mantém o UID como fallback.
 *
 * Retorna:
 * true se já existe assinatura ativa;
 * false se pode criar.
 */
export async function existeAssinaturaAtivaDoPlano(
    empresaId,
    userId,
    planoId
) {
    const clienteId = resolverClienteId(
        auth.currentUser,
        userId
    );

    if (
        !empresaId ||
        !clienteId ||
        !planoId
    ) {
        return false;
    }

    const assinaturasRef = collection(
        db,
        "empresarios",
        empresaId,
        "clientes",
        clienteId,
        "assinaturas"
    );

    const q = query(
        assinaturasRef,
        where(
            "planoId",
            "==",
            planoId
        ),
        where(
            "status",
            "==",
            "ativo"
        )
    );

    const snap = await getDocs(q);

    let algumaAtiva = false;
    const hoje = new Date();

    snap.forEach(doc => {
        const a = doc.data();

        if (
            a.dataFim &&
            a.dataFim.toDate &&
            a.dataFim.toDate() > hoje
        ) {
            algumaAtiva = true;
        }
    });

    return algumaAtiva;
}
