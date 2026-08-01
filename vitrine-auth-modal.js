// ======================================================================
//          VITRINE-AUTH-MODAL.JS — PRONTI PET
// ======================================================================

import {
    setupAuthListener,
    fazerLogin
} from "./vitrini-auth.js";

// ----------------------------------------------------------------------
// MULTIEMPRESA
// ----------------------------------------------------------------------
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

// ----------------------------------------------------------------------
// FUNÇÕES VISUAIS SEGURAS
// ----------------------------------------------------------------------
function abrirModalAutenticacao() {
    if (typeof window.showModalAuth === "function") {
        window.showModalAuth();
        return;
    }

    const modal =
        document.getElementById("modal-auth") ||
        document.getElementById("modal-login");

    if (!modal) {
        console.warn("[Vitrine] Modal de autenticação não encontrado.");
        return;
    }

    modal.style.display = "flex";
    modal.classList.add("ativo");
    modal.setAttribute("aria-hidden", "false");
}

function fecharModalAutenticacao() {
    if (typeof window.hideModalAuth === "function") {
        window.hideModalAuth();
        return;
    }

    const modal =
        document.getElementById("modal-auth") ||
        document.getElementById("modal-login");

    if (!modal) return;

    modal.style.display = "none";
    modal.classList.remove("ativo");
    modal.setAttribute("aria-hidden", "true");
}

function exibirEtapa(etapa) {
    if (typeof window.showStep === "function") {
        window.showStep(etapa);
    }
}

// ----------------------------------------------------------------------
// ESTADO DE AUTENTICAÇÃO
// Não abre o login automaticamente.
// O cliente pode navegar livremente na vitrine.
// ----------------------------------------------------------------------
setupAuthListener((user) => {
    const empresaId = getEmpresaIdAtiva();

    if (user) {
        console.log("[Vitrine] Cliente autenticado:", {
            uid: user.uid,
            empresaId
        });

        fecharModalAutenticacao();
        return;
    }

    console.log("[Vitrine] Cliente navegando sem login.", {
        empresaId
    });

    // Não abrir modal aqui.
    // O modal será chamado apenas quando uma ação exigir autenticação.
});

// ----------------------------------------------------------------------
// FUNÇÃO PÚBLICA PARA EXIGIR LOGIN SOMENTE AO AGENDAR
// Outros arquivos podem chamar:
// window.exigirLoginVitrine()
// ----------------------------------------------------------------------
window.exigirLoginVitrine = function exigirLoginVitrine() {
    abrirModalAutenticacao();
    exibirEtapa("login");
};

// ----------------------------------------------------------------------
// EVENTOS DO MODAL
// ----------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
    const btnToCadastro = document.getElementById(
        "modal-auth-btn-to-cadastro"
    );

    const btnToLogin = document.getElementById(
        "modal-auth-btn-to-login"
    );

    const btnGoogle = document.getElementById(
        "modal-auth-btn-google"
    );

    const formLogin = document.getElementById(
        "modal-auth-form-login"
    );

    const formCadastro = document.getElementById(
        "modal-auth-form-cadastro"
    );

    if (btnToCadastro) {
        btnToCadastro.addEventListener("click", () => {
            exibirEtapa("cadastro");
        });
    }

    if (btnToLogin) {
        btnToLogin.addEventListener("click", () => {
            exibirEtapa("login");
        });
    }

    if (btnGoogle) {
        btnGoogle.addEventListener("click", async () => {
            if (btnGoogle.disabled) return;

            btnGoogle.disabled = true;

            try {
                const usuario = await fazerLogin();

                if (usuario) {
                    fecharModalAutenticacao();
                }
            } catch (error) {
                console.error(
                    "[Vitrine] Erro inesperado no login Google:",
                    error
                );
            } finally {
                btnGoogle.disabled = false;
            }
        });
    }

    if (formLogin) {
        formLogin.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (typeof window.handleLoginEmail !== "function") {
                console.error(
                    "[Vitrine] handleLoginEmail não foi encontrada."
                );
                return;
            }

            await window.handleLoginEmail(event);
        });
    }

    if (formCadastro) {
        formCadastro.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (typeof window.handleCadastro !== "function") {
                console.error(
                    "[Vitrine] handleCadastro não foi encontrada."
                );
                return;
            }

            await window.handleCadastro(event);
        });
    }
});
