// ======================================================================
//          VITRINE-AUTH-MODAL.JS — PRONTI PET
//          FLUXO ORIGINAL PRESERVADO
// ======================================================================

import { setupAuthListener } from "./vitrini-auth.js";

// ----------------------------------------------------------------------
// MULTIEMPRESA
// Mantido para compatibilidade com o fluxo atual da vitrine.
// ----------------------------------------------------------------------
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

// ----------------------------------------------------------------------
// ESTADO DE AUTENTICAÇÃO
//
// Regra preservada:
// - o cliente pode entrar e navegar na vitrine sem login;
// - o modal NÃO abre automaticamente ao carregar a página;
// - o login continua sendo solicitado pelo fluxo original do botão Agendar;
// - quando a autenticação é concluída, o modal é fechado.
// ----------------------------------------------------------------------
setupAuthListener((user) => {
    const empresaId = getEmpresaIdAtiva();

    if (!user) {
        console.log("[Vitrine] Cliente navegando sem login.", {
            empresaId
        });

        // Não abrir o modal automaticamente.
        // O fluxo original do botão Agendar continua responsável por isso.
        return;
    }

    console.log("[Vitrine] Cliente autenticado:", {
        uid: user.uid,
        empresaId
    });

    // Preserva a função visual já existente na vitrine.
    if (typeof window.hideModalAuth === "function") {
        window.hideModalAuth();
    }
});

// ----------------------------------------------------------------------
// EVENTOS DO MODAL
//
// Importante:
// As funções handleLoginGoogle, handleLoginEmail, handleCadastro e showStep
// pertencem ao fluxo original da vitrine e podem realizar outras ações além
// do Firebase Authentication, como:
// - vincular o cadastro do cliente;
// - atualizar o estado da vitrine;
// - fechar o modal;
// - continuar o agendamento.
//
// Por isso, elas são preservadas e chamadas por window.
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

    // --------------------------------------------------------------
    // TROCA PARA A TELA DE CADASTRO
    // --------------------------------------------------------------
    if (btnToCadastro) {
        btnToCadastro.onclick = () => {
            if (typeof window.showStep === "function") {
                window.showStep("cadastro");
            } else {
                console.error(
                    "[Vitrine] A função showStep não foi encontrada."
                );
            }
        };
    }

    // --------------------------------------------------------------
    // VOLTA PARA A TELA DE LOGIN
    // --------------------------------------------------------------
    if (btnToLogin) {
        btnToLogin.onclick = () => {
            if (typeof window.showStep === "function") {
                window.showStep("login");
            } else {
                console.error(
                    "[Vitrine] A função showStep não foi encontrada."
                );
            }
        };
    }

    // --------------------------------------------------------------
    // LOGIN COM GOOGLE
    // Preserva integralmente o manipulador original da vitrine.
    // --------------------------------------------------------------
    if (btnGoogle) {
        btnGoogle.onclick = async () => {
            if (btnGoogle.disabled) return;

            if (typeof window.handleLoginGoogle !== "function") {
                console.error(
                    "[Vitrine] A função handleLoginGoogle não foi encontrada."
                );
                return;
            }

            btnGoogle.disabled = true;

            try {
                await window.handleLoginGoogle();
            } catch (error) {
                console.error(
                    "[Vitrine] Erro no fluxo original de login Google:",
                    error
                );
            } finally {
                btnGoogle.disabled = false;
            }
        };
    }

    // --------------------------------------------------------------
    // LOGIN COM E-MAIL
    // --------------------------------------------------------------
    if (formLogin) {
        formLogin.onsubmit = async (event) => {
            event.preventDefault();

            if (typeof window.handleLoginEmail !== "function") {
                console.error(
                    "[Vitrine] A função handleLoginEmail não foi encontrada."
                );
                return;
            }

            await window.handleLoginEmail(event);
        };
    }

    // --------------------------------------------------------------
    // CADASTRO DO CLIENTE
    // --------------------------------------------------------------
    if (formCadastro) {
        formCadastro.onsubmit = async (event) => {
            event.preventDefault();

            if (typeof window.handleCadastro !== "function") {
                console.error(
                    "[Vitrine] A função handleCadastro não foi encontrada."
                );
                return;
            }

            await window.handleCadastro(event);
        };
    }
});
