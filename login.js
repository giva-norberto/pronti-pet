// ======================================================================
//        LOGIN.JS — PRONTI PET (SESSÃO PERSISTENTE)
// ======================================================================

import {
    signInWithPopup,
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { auth, provider } from "./firebase-config.js";

/**
 * Define a persistência local do Firebase Authentication.
 *
 * Com browserLocalPersistence, a sessão deve permanecer ativa mesmo após:
 * - fechar e reabrir o navegador;
 * - fechar e reabrir o PWA;
 * - atualizar a página.
 */
async function configurarPersistenciaLocal() {
    await setPersistence(auth, browserLocalPersistence);
}

// Se o Firebase restaurar uma sessão válida, não exige novo login.
// A seleção/validação da empresa continua sendo responsabilidade da tela
// selecionar-empresa.html e do fluxo existente do sistema.
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.replace("selecionar-empresa.html");
    }
});

window.addEventListener("DOMContentLoaded", () => {
    const btnLoginGoogle = document.getElementById("btn-login-google");
    const loginForm = document.getElementById("login-form");
    const loginStatusDiv = document.getElementById("login-status");

    function exibirMensagem(mensagem = "") {
        if (loginStatusDiv) {
            loginStatusDiv.textContent = mensagem;
        }
    }

    // ==============================================================
    // LOGIN COM GOOGLE
    // ==============================================================
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener("click", async () => {
            btnLoginGoogle.disabled = true;
            exibirMensagem("");

            try {
                await configurarPersistenciaLocal();
                await signInWithPopup(auth, provider);

                // A tela selecionar-empresa.html decide o destino seguinte.
                window.location.href = "selecionar-empresa.html";
            } catch (error) {
                console.error("Erro no login com Google:", error);

                if (error.code !== "auth/popup-closed-by-user") {
                    exibirMensagem("Não foi possível fazer login com o Google.");
                }

                btnLoginGoogle.disabled = false;
            }
        });
    }

    // ==============================================================
    // LOGIN COM E-MAIL E SENHA
    // ==============================================================
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            exibirMensagem("");

            const submitButton = loginForm.querySelector(
                'button[type="submit"]'
            );

            if (submitButton) {
                submitButton.disabled = true;
            }

            const emailInput = document.getElementById("login-email");
            const senhaInput = document.getElementById("login-senha");

            const email = emailInput?.value.trim() || "";
            const password = senhaInput?.value || "";

            if (!email || !password) {
                exibirMensagem("Informe o e-mail e a senha.");

                if (submitButton) {
                    submitButton.disabled = false;
                }

                return;
            }

            try {
                await configurarPersistenciaLocal();
                await signInWithEmailAndPassword(auth, email, password);

                // A tela selecionar-empresa.html decide o destino seguinte.
                window.location.href = "selecionar-empresa.html";
            } catch (error) {
                console.error("Erro no login manual:", error);

                if (
                    error.code === "auth/user-not-found" ||
                    error.code === "auth/wrong-password" ||
                    error.code === "auth/invalid-credential" ||
                    error.code === "auth/invalid-login-credentials"
                ) {
                    exibirMensagem("E-mail ou senha inválidos.");
                } else if (error.code === "auth/too-many-requests") {
                    exibirMensagem(
                        "Muitas tentativas. Aguarde alguns minutos e tente novamente."
                    );
                } else if (error.code === "auth/network-request-failed") {
                    exibirMensagem(
                        "Não foi possível conectar. Verifique sua internet."
                    );
                } else {
                    exibirMensagem("Ocorreu um erro. Tente novamente.");
                }

                if (submitButton) {
                    submitButton.disabled = false;
                }
            }
        });
    }
});
