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
// FUNÇÕES AUXILIARES SEGURAS
// Usa window porque as funções visuais podem estar em outro arquivo.
// ----------------------------------------------------------------------
function abrirModalAutenticacao() {
    if (typeof window.showModalAuth === "function") {
        window.showModalAuth();
        return;
    }

    const modal = document.getElementById("modal-auth");

    if (modal) {
        modal.style.display = "flex";
        modal.classList.add("ativo");
        modal.setAttribute("aria-hidden", "false");
    }
}

function fecharModalAutenticacao() {
    if (typeof window.hideModalAuth === "function") {
        window.hideModalAuth();
        return;
    }

    const modal = document.getElementById("modal-auth");

    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("ativo");
        modal.setAttribute("aria-hidden", "true");
    }
}

function exibirEtapa(etapa) {
    if (typeof window.showStep === "function") {
        window.showStep(etapa);
        return;
    }

    console.warn(
        `[Vitrine] A função showStep não foi encontrada. Etapa solicitada: ${etapa}`
    );
}

// ----------------------------------------------------------------------
// LISTENER DE AUTENTICAÇÃO
// ----------------------------------------------------------------------
setupAuthListener((user) => {
    const empresaId = getEmpresaIdAtiva();

    if (!user) {
        console.log("[Vitrine] Cliente não autenticado.", {
            empresaId
        });

        abrirModalAutenticacao();
        exibirEtapa("login");
        return;
    }

    console.log("[Vitrine] Cliente autenticado:", {
        uid: user.uid,
        empresaId
    });

    fecharModalAutenticacao();
});

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

    // Trocar para cadastro
    if (btnToCadastro) {
        btnToCadastro.addEventListener("click", () => {
            exibirEtapa("cadastro");
        });
    }

    // Voltar para login
    if (btnToLogin) {
        btnToLogin.addEventListener("click", () => {
            exibirEtapa("login");
        });
    }

    // Login Google
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
                    "[Vitrine] Erro inesperado no botão Google:",
                    error
                );
            } finally {
                btnGoogle.disabled = false;
            }
        });
    }

    // Login por e-mail
    if (formLogin) {
        formLogin.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (typeof window.handleLoginEmail !== "function") {
                console.error(
                    "[Vitrine] A função handleLoginEmail não foi encontrada."
                );
                return;
            }

            await window.handleLoginEmail(event);
        });
    }

    // Cadastro
    if (formCadastro) {
        formCadastro.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (typeof window.handleCadastro !== "function") {
                console.error(
                    "[Vitrine] A função handleCadastro não foi encontrada."
                );
                return;
            }

            await window.handleCadastro(event);
        });
    }
});
