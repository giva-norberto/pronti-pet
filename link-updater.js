// Conteúdo do arquivo: link-updater.js (versão multiempresa)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Obtém o empresaId da empresa ativa selecionada (multiempresa) via localStorage.
 */
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

/**
 * Função que busca o slug da empresa ativa e atualiza o link da vitrine.
 * No contexto multiempresa, cada empresa pode ter seu próprio slug.
 */
async function atualizarLinkVitrine() {
    const linkVitrine = document.getElementById('link-minha-vitrine');
    if (!linkVitrine) {
        console.log("Link da vitrine não encontrado na página.");
        return;
    }

    const empresaId = getEmpresaIdAtiva();
    if (!empresaId) {
        // Se não houver empresa ativa, direciona para seleção/cadastro de empresa
        linkVitrine.href = "selecionar-empresa.html";
        linkVitrine.title = "Selecione ou cadastre sua empresa para ativar a vitrine";
        return;
    }

    try {
        // Busca o perfil público da empresa ativa (coleção multiempresa)
        const perfilRef = doc(db, "empresarios", empresaId, "publicProfile", "profile");
        const docSnap = await getDoc(perfilRef);

        if (docSnap.exists() && docSnap.data().slug) {
            const slug = docSnap.data().slug;
            // Link final usando o slug da empresa ativa
            linkVitrine.href = `vitrine.html?slug=${slug}`;
            linkVitrine.title = "Ver a vitrine pública da empresa";
        } else {
            // Se não encontrar o slug, direciona para perfil da empresa ativa
            linkVitrine.href = 'perfil-empresa.html';
            linkVitrine.title = 'Configure o slug da empresa para ativar a vitrine';
        }
    } catch (error) {
        console.error("Erro ao buscar slug para o link da vitrine:", error);
    }
}

// Escuta o status do login do usuário
onAuthStateChanged(auth, (user) => {
    const linkVitrine = document.getElementById('link-minha-vitrine');
    if (!linkVitrine) return;

    if (user) {
        // Se o usuário estiver logado, corrige o link conforme empresa ativa
        atualizarLinkVitrine();
    } else {
        // Se não estiver logado, direciona link para login
        linkVitrine.href = 'login.html';
        linkVitrine.title = 'Faça login para acessar sua vitrine';
    }
});
