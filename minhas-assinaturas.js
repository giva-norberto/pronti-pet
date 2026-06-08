import { db, auth } from './vitrini-firebase.js';
import { collection, query, getDocs, where } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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
        if (auth.currentUser) return resolve(auth.currentUser);
        const unsub = auth.onAuthStateChanged(user => {
            unsub();
            resolve(user);
        });
    });
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

    const assinaturasRef = collection(db, "empresarios", empresaId, "clientes", user.uid, "assinaturas");
    const q = query(assinaturasRef);
    const snap = await getDocs(q);

    // Agrupa sempre a assinatura MAIS RECENTE para cada plano
    const porPlanoMaisRecente = {};  // planoId -> assinatura mais nova

    snap.forEach(doc => {
        const a = doc.data();
        const planoId = a.planoId || a.planoNome;
        if (!planoId) return;

        let dataFimObj = undefined;
        if (a.dataFim && a.dataFim.toDate) {
            dataFimObj = a.dataFim.toDate();
        } else {
            dataFimObj = new Date(0); // Valor antigo, se não tiver dataFim para garantir ordenação
        }

        // Só mantém a assinatura mais recente por plano
        if (
            !porPlanoMaisRecente[planoId] ||
            (porPlanoMaisRecente[planoId].dataFimObj < dataFimObj)
        ) {
            porPlanoMaisRecente[planoId] = {
                ...a,
                dataFimObj
            };
        }
    });

    // Agora, para cada plano, escolhemos só UMA para mostrar:
    const hoje = new Date();
    let assinaturasMostrar = [];

    Object.values(porPlanoMaisRecente).forEach(a => {
        let status = "VENCIDA";
        if (
            a.status === "ativo" &&
            a.dataFimObj &&
            a.dataFimObj > hoje
        ) {
            const diasRestantes = (a.dataFimObj - hoje) / (1000 * 60 * 60 * 24);
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
        // Ativas e vencendo em cima
        if (a.status === "VENCIDA" && b.status !== "VENCIDA") return 1;
        if (b.status === "VENCIDA" && a.status !== "VENCIDA") return -1;
        // Entre ativas/vencendo, ordem por data mais próxima de expirar
        if (a.status === "VENCIDA" && b.status === "VENCIDA") {
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
        let cardStyle = '';
        let statusHtml = `<b>${a.status}</b>`;

        if (a.status === "VENCENDO") {
            cardStyle = 'border:2px solid #f59e42;background:#fffbea;';
            statusHtml = `<span style="color:#f59e42;font-weight:bold;">VENCENDO</span>`;
        } else if (a.status === "VENCIDA") {
            cardStyle = 'opacity:0.7;';
            statusHtml = `<b style="color:#e53e3e;">VENCIDA</b>`;
        }

        const item = document.createElement('div');
        item.className = 'card-assinatura';
        if (cardStyle) item.setAttribute('style', cardStyle);

        item.innerHTML = `
            <b>${a.planoNome || a.planoId}</b><br>
            Status: ${statusHtml}<br>
            Validade até: <span>${a.dataFimObj ? a.dataFimObj.toLocaleDateString('pt-BR') : '---'}</span>
        `;
        divAlvo.appendChild(item);
    });
}

/**
 * CHECA SE USUÁRIO JÁ TEM ASSINATURA ATIVA OU VENCENDO DESSE PLANO (para bloquear duplicidade)
 * Uso: await existeAssinaturaAtivaDoPlano(empresaId, user.uid, planoId)
 * Retorna: true se já existe (ativa ou vencendo), false se pode criar
 */
export async function existeAssinaturaAtivaDoPlano(empresaId, userId, planoId) {
    const assinaturasRef = collection(db, "empresarios", empresaId, "clientes", userId, "assinaturas");
    // Filtra por planoId, status ativo
    const q = query(
        assinaturasRef,
        where("planoId", "==", planoId),
        where("status", "==", "ativo")
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
