/**
 * link-fixer.js (VERSÃO MULTIEMPRESA)
 *
 * Lógica Principal:
 * 1. IMPORTA a configuração do Firebase, em vez de reinicializar.
 * 2. Usa SEMPRE o 'empresaId' da empresa ativa do localStorage (multiempresa).
 * 3. Atualiza o link "Minha Vitrine" com o URL correto, baseado no 'empresaId' ativo.
 */

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Busca empresaId da empresa ativa do localStorage (multiempresa).
 * Se não houver, retorna null.
 */
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

/**
 * Atualiza o link da vitrine para a empresa ativa.
 * Se não houver empresa ativa, aponta para seleção/cadastro.
 */
function atualizarLinkVitrine() {
    const linkVitrine = document.getElementById('link-minha-vitrine');
    if (!linkVitrine) return;

    const empresaId = getEmpresaIdAtiva();

    if (empresaId) {
        // Multiempresa: usa a empresa ativa para montar o link
        linkVitrine.href = `vitrine.html?empresa=${empresaId}`;
        linkVitrine.title = 'Ver a sua vitrine pública';
    } else {
        // Não há empresa ativa: força seleção ou configuração de perfil
        linkVitrine.href = 'selecionar-empresa.html';
        linkVitrine.title = 'Selecione ou cadastre sua empresa para ativar a vitrine';
    }
}

// Monitora login/logout e atualiza o link da vitrine conforme empresa ativa
onAuthStateChanged(auth, (user) => {
    const linkVitrine = document.getElementById('link-minha-vitrine');
    if (!linkVitrine) return;

    if (user) {
        atualizarLinkVitrine();
    } else {
        // Se não logado, força login
        linkVitrine.href = 'login.html';
        linkVitrine.title = 'Faça login para acessar sua vitrine';
    }
});
