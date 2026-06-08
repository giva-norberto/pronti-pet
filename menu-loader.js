/**
 * @file menu-lateral.js
 * @description Gerencia o menu lateral, incluindo logout, link ativo e visibilidade dinâmica dos itens com base nas permissões globais do usuário.
 * @author Giva-Norberto & Gemini Assistant
 * @version Exemplo SPA/fetch
 */

import { auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { verificarAcesso } from "./userService.js";

// Configura o botão de logout e destaca o link da página ativa
function setupMenuFeatures() {
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout && !btnLogout.dataset.listenerAttached) {
        btnLogout.dataset.listenerAttached = 'true';
        btnLogout.addEventListener("click", () => {
            signOut(auth).then(() => {
                localStorage.clear();
                window.location.href = "login.html";
            }).catch(err => console.error("❌ Erro ao deslogar:", err));
        });
    }

    const currentPage = window.location.pathname;
    document.querySelectorAll('#sidebar-links a').forEach(link => {
        const linkPath = new URL(link.href, window.location.origin).pathname;
        if (linkPath === currentPage) {
            link.closest('li')?.classList.add('active');
        }
    });
}

// Atualiza a visibilidade dos menus com base nas permissões
async function updateMenuWithPermissions() {
    try {
        // Pega os dados da sessão (usuário e seu papel)
        const sessao = await verificarAcesso();

        // Robustez: define papelUsuario corretamente mesmo que venha vazio
        let papelUsuario = sessao.perfil?.papel;
        if (!papelUsuario) {
            if (sessao.isAdmin) {
                papelUsuario = "admin";
            } else if (sessao.isOwner) {
                papelUsuario = "dono";
            } else {
                papelUsuario = "funcionario";
            }
        }

        // Busca as regras de permissão globais do Firestore
        const permissoesRef = doc(db, "configuracoesGlobais", "permissoes");
        const permissoesSnap = await getDoc(permissoesRef);
        const regrasGlobais = permissoesSnap.exists() ? permissoesSnap.data() : {};

        // Pega todos os itens de menu que devem ser controlados
        const menuItems = document.querySelectorAll('[data-menu-id]');

        // Lógica: mostra menu se não há regra OU se permitido
        menuItems.forEach(item => {
            const menuId = item.dataset.menuId; // Ex: 'agenda', 'clientes'
            const regraParaMenu = regrasGlobais[menuId];

            // Mostra se não há regra ou se papel tem permissão explícita
            if (!regraParaMenu || regraParaMenu[papelUsuario] === true) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });

    } catch (error) {
        console.error("❌ Erro ao aplicar permissões no menu:", error);
    }
}

// Inicialização do Menu
(async () => {
    try {
        // Esconde todos os menus inicialmente para evitar "piscar" na tela
        document.querySelectorAll('[data-menu-id]').forEach(el => el.style.display = 'none');

        await updateMenuWithPermissions();
        setupMenuFeatures();
    } catch (err) {
        console.error("❌ Erro fatal inicializando menu lateral:", err);
    }
})();
