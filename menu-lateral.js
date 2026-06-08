// ======================================================================
// ARQUIVO: menu-lateral.js
// FUNÇÃO: Controla o menu lateral, permissões de acesso e logout.
// Atualização: preserva o botão #btn-logout e garante que o botão flutuante
// "Voltar" não o cubra no desktop; mantém lógica original intacta.
// ======================================================================

// --- 1. Importações Essenciais ---
import { auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- 2. Função Principal de Ativação ---
/**
 * Ponto de entrada principal para inicializar o menu.
 * Esta função é exportada para ser chamada por outras páginas (ex: dashboard.js).
 * @param {string|string[]} papelUsuario - O papel (ou papéis) do usuário logado. Ex: 'dono' ou ['dono', 'admin'].
 */
export async function ativarMenuLateral(papelUsuario) {
    // CORREÇÃO: Sempre converte para array (e nunca array vazio)
    if (typeof papelUsuario === "string") {
        papelUsuario = [papelUsuario];
    }
    if (!Array.isArray(papelUsuario)) {
        papelUsuario = [];
    }
    // Se o array está vazio, não faça nada e esconda todos os menus
    if (papelUsuario.length === 0) {
        console.error("Papel do usuário NÃO informado para aplicarPermissoesMenuLateral. O menu não será exibido corretamente.");
        document.querySelectorAll('.sidebar-links [data-menu-id]').forEach(link => {
            link.style.display = "none";
        });
        return;
    }
    // Passo A: Aplica as regras de visibilidade dos links do menu.
    await aplicarPermissoesMenuLateral(papelUsuario);
    // Passo B: Destaca o link da página atual.
    marcarLinkAtivo();
    // Passo B.5: Injeta botão flutuante "Voltar" próximo ao menu (sem tocar templates).
    // A rotina preserva qualquer botão #btn-logout já existente e evita sobreposição.
    try {
        inserirBotaoFlutuanteMenu();
    } catch (e) {
        // não interrompe fluxo original
        console.warn('[menu-lateral] não foi possível inserir botão flutuante:', e);
    }
    // Passo C: Garante que o botão de logout funcione corretamente.
    configurarBotaoLogout();
}

/* ---------------------------------------------------------------------
   Rotina: inserirBotaoFlutuanteMenu
   - cria um botão flutuante (círculo) posicionado próximo ao sidebar
   - comportamento: history.back() quando possível, senão redireciona para index.html
   - preserva totalmente o botão #btn-logout (não altera/oculta)
   --------------------------------------------------------------------- */

/**
 * Detecta se o app está em modo PWA/standalone (iOS/Android).
 * @returns {boolean}
 */
function isPWAInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || (window.navigator && window.navigator.standalone === true)
        || (document.referrer && document.referrer.startsWith('android-app://'));
}

/**
 * Cria/injeta botão flutuante ao lado do menu lateral (ou em posição padrão em mobile).
 * Evita cobrir #btn-logout caso este exista e esteja visível.
 */
function inserirBotaoFlutuanteMenu() {
    const BUTTON_ID = 'pronti-floating-back';
    const HOME_URL = window.PRONTI_HOME_URL || '/index.html';

    // Se já existe, apenas atualiza posição/visibilidade
    let btn = document.getElementById(BUTTON_ID);
    if (btn) {
        atualizarPosicaoEVisibilidade();
        return;
    }

    // cria botão
    btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.setAttribute('aria-label', 'Voltar');
    btn.title = 'Voltar';
    btn.innerHTML = '<i class="fa fa-arrow-left" aria-hidden="true" style="font-size:18px;"></i>';

    // estilos inline mínimos (garante aparecimento mesmo sem CSS)
    Object.assign(btn.style, {
        position: 'fixed',
        zIndex: '1600',
        width: '52px',
        height: '52px',
        borderRadius: '26px',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        background: '#ffffff',
        color: 'var(--cor-azul-pronti, #4f46e5)',
        cursor: 'pointer',
        transition: 'transform .12s ease, opacity .12s ease',
        opacity: '0',
        pointerEvents: 'auto'
    });

    // feedback visual
    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.96)'; });
    btn.addEventListener('pointerup', () => { btn.style.transform = ''; });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });

    // click handler: back or fallback home
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
            if (window.history && window.history.length > 1) {
                history.back();
                return;
            }
        } catch (err) {
            console.warn('[menu-lateral] history.back falhou:', err);
        }
        window.location.href = HOME_URL;
    });

    document.body.appendChild(btn);

    // throttle helper
    let lastCall = 0;
    function throttledAtualizar() {
        const now = Date.now();
        if (now - lastCall > 80) {
            lastCall = now;
            atualizarPosicaoEVisibilidade();
        }
    }

    // Reposiciona em eventos relevantes
    window.addEventListener('resize', throttledAtualizar);
    window.addEventListener('scroll', throttledAtualizar, { passive: true });
    window.addEventListener('popstate', atualizarPosicaoEVisibilidade);
    window.addEventListener('hashchange', atualizarPosicaoEVisibilidade);
    document.addEventListener('visibilitychange', atualizarPosicaoEVisibilidade);

    // Observe alterações no DOM para reposicionar se necessário (não crítico)
    try {
        const mo = new MutationObserver(() => { throttledAtualizar(); });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (err) {
        // continua sem observer se não suportado
    }

    // chamada inicial com pequeno atraso para permitir que DOM finalize
    setTimeout(() => atualizarPosicaoEVisibilidade(), 20);

    /**
     * Posiciona o botão próximo ao sidebar (desktop) ou como botão suspenso (mobile).
     * Se existe #btn-logout visível, ajusta posição para evitar sobreposição.
     */
    function atualizarPosicaoEVisibilidade() {
        const btnEl = document.getElementById(BUTTON_ID);
        if (!btnEl) return;

        const path = location.pathname || '/';
        const isHome = (path === '/' || path.endsWith('/index.html'));
        const hasHistory = (window.history && window.history.length > 1);
        const shouldShow = hasHistory || isPWAInstalled() || !isHome;

        // default hide if shouldn't show
        if (!shouldShow) {
            btnEl.style.opacity = '0';
            btnEl.style.pointerEvents = 'none';
        } else {
            btnEl.style.opacity = '1';
            btnEl.style.pointerEvents = 'auto';
        }

        const sidebar = document.getElementById('sidebar');
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

        // detect logout button bounding box if visible (we must NOT modify it)
        const logout = document.getElementById('btn-logout');
        let logoutRect = null;
        if (logout && logout.offsetParent !== null) { // visible in layout
            try { logoutRect = logout.getBoundingClientRect(); } catch (e) { logoutRect = null; }
        }

        if (vw > 900 && sidebar) {
            // desktop: place button adjacent to sidebar's right edge
            const rect = sidebar.getBoundingClientRect();
            let left = rect.right + 12; // gap after sidebar
            let top = Math.max(rect.top + 20, 20);

            // If logout exists and is near this region, adjust vertical position upward to avoid overlap
            if (logoutRect) {
                // if logout is on right side and near bottom-right, and our computed left is near it horizontally,
                // push the floating button upward so it does not overlap logout.
                const potentialOverlapX = (logoutRect.left <= left + 60 && logoutRect.right >= left - 60);
                const potentialOverlapY = (Math.abs((logoutRect.top) - top) < 80);
                if (potentialOverlapX && potentialOverlapY) {
                    // push up enough to clear logout
                    top = Math.max(12, logoutRect.top - 72);
                }
            }

            Object.assign(btnEl.style, {
                left: `${Math.min(Math.max(left, 12), vw - 72)}px`,
                top: `${top}px`,
                bottom: 'auto',
                right: 'auto'
            });
        } else {
            // mobile/tablet: place bottom-left like suspended button, avoid logout if visible bottom-left/right
            const bottomGap = 22;
            const left = 16;
            let bottom = bottomGap;

            if (logoutRect) {
                // If logout is bottom-right, no horizontal conflict; if logout sits bottom-left and visible, move our button up
                const logoutNearLeft = (logoutRect.left < vw / 2);
                if (logoutNearLeft) {
                    // raise floating button to avoid covering logout
                    bottom = Math.max(bottomGap + logoutRect.height + 12, bottomGap);
                }
            }

            Object.assign(btnEl.style, {
                left: `${left}px`,
                bottom: `${bottom}px`,
                top: 'auto',
                right: 'auto'
            });
        }
    }
}

/* ---------------------------------------------------------------------
   Mantive a lógica original de permissões, marcação de link e logout
   sem alterações funcionais. Abaixo segue o código original
   (com pequenas correções de robustez).
   --------------------------------------------------------------------- */

// --- 3. Lógica de Permissões ---
/**
 * Função auxiliar que verifica se o usuário tem permissão para ver um item de menu.
 * @param {object} menus - O objeto de regras de permissão vindo do Firestore.
 * @param {string} id - O 'data-menu-id' do link que estamos verificando.
 * @param {string[]} papelUsuario - O array de papéis do usuário.
 * @returns {boolean} - Retorna true se o usuário tiver permissão, senão false.
 */
function temPermissao(menus, id, papelUsuario) {
    if (!menus[id]) return false;
    return papelUsuario.some(papel => menus[id][papel] === true);
}

/**
 * Busca as regras no Firestore e aplica a visibilidade (mostra/esconde) nos links do menu.
 * @param {string[]} papelUsuario - O array de papéis do usuário.
 */
async function aplicarPermissoesMenuLateral(papelUsuario) {
    if (!Array.isArray(papelUsuario) || papelUsuario.length === 0) {
        console.error("Papel do usuário NÃO informado para aplicarPermissoesMenuLateral. O menu não será exibido corretamente.");
        document.querySelectorAll('.sidebar-links [data-menu-id]').forEach(link => {
            link.style.display = "none";
        });
        return;
    }

    try {
        const permissoesRef = doc(db, "configuracoesGlobais", "permissoes");
        const permissoesSnap = await getDoc(permissoesRef);
        const regras = permissoesSnap.exists() ? permissoesSnap.data() : {};
        const menus = regras;

        document.querySelectorAll('.sidebar-links [data-menu-id]').forEach(link => {
            const id = link.dataset.menuId;
            const podeVer = temPermissao(menus, id, papelUsuario);
            link.style.display = podeVer ? "" : "none";
        });

    } catch (error) {
        console.error("Erro crítico ao buscar ou aplicar permissões no menu lateral:", error);
        document.querySelectorAll('.sidebar-links [data-menu-id]').forEach(link => {
            link.style.display = "none";
        });
    }
}

// --- 4. Funções de Interface do Usuário (UI) ---
/**
 * Destaca o link do menu correspondente à página que o usuário está visitando.
 */
function marcarLinkAtivo() {
    const urlAtual = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.sidebar-links a').forEach(link => {
        link.classList.remove('active');
        const linkHref = link.getAttribute('href').split('/').pop();
        if (linkHref === urlAtual) {
            link.classList.add('active');
        }
    });
}

/**
 * Configura o botão de logout para funcionar de forma segura e confiável.
 * Esta função preserva o botão existente (#btn-logout) e apenas re-encadeia o listener.
 */
function configurarBotaoLogout() {
    const btnLogout = document.getElementById("btn-logout");
    if (!btnLogout) {
        // se não existir no DOM agora, não criamos/removemos; apenas logamos e seguimos
        console.warn("Botão de logout com id='btn-logout' não foi encontrado no HTML. A função simplesmente retorna.");
        return;
    }

    // NÃO alteramos display/estilos do btnLogout — apenas substituímos o elemento por um clone para remover listeners antigos
    const btnClone = btnLogout.cloneNode(true);
    btnLogout.parentNode.replaceChild(btnClone, btnLogout);

    btnClone.addEventListener("click", async () => {
        try {
            await signOut(auth);
            localStorage.clear();
            window.location.href = "login.html";
        } catch (err) {
            console.error("❌ Erro ao tentar fazer logout:", err);
            alert("Não foi possível sair. Por favor, tente novamente.");
        }
    });
}
