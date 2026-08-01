// ======================================================================
//              VITRINI-AUTH.JS — PRONTI PET
// ======================================================================

import { auth, provider } from "./vitrini-firebase.js";

import {
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { showAlert } from "./vitrini-utils.js";

// Guarda a configuração para não executar setPersistence repetidamente.
let persistenciaConfigurada = false;

/**
 * Configura a sessão local do Firebase.
 * Mantém o usuário conectado após atualizar ou fechar o navegador/PWA.
 */
async function garantirPersistenciaLocal() {
    if (persistenciaConfigurada) return;

    await setPersistence(auth, browserLocalPersistence);
    persistenciaConfigurada = true;
}

/**
 * MULTIEMPRESA:
 * Retorna o ID da empresa atualmente selecionada.
 */
export function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

/**
 * Observa alterações no estado de autenticação.
 */
export function setupAuthListener(callback) {
    return onAuthStateChanged(
        auth,
        user => {
            if (typeof callback === "function") {
                callback(user);
            }
        },
        error => {
            console.error(
                "[Vitrine] Erro ao observar autenticação:",
                error
            );

            if (typeof callback === "function") {
                callback(null);
            }
        }
    );
}

/**
 * Realiza login com Google.
 */
export async function fazerLogin() {
    try {
        await garantirPersistenciaLocal();

        const resultado = await signInWithPopup(auth, provider);
        const usuario = resultado.user;

        console.log(
            "[Vitrine] Login realizado com sucesso:",
            usuario.uid
        );

        fecharModalLogin();

        // Importante: permite que outros arquivos recebam o usuário.
        return usuario;

    } catch (error) {
        console.error(
            "[Vitrine] Erro no login:",
            error.code,
            error.message
        );

        if (error.code === "auth/popup-closed-by-user") {
            return null;
        }

        if (error.code === "auth/popup-blocked") {
            await showAlert(
                "Popup bloqueado",
                "O navegador bloqueou a janela de login. Libere os popups e tente novamente."
            );

            return null;
        }

        if (error.code === "auth/cancelled-popup-request") {
            return null;
        }

        if (error.code === "auth/network-request-failed") {
            await showAlert(
                "Sem conexão",
                "Não foi possível acessar o Google. Verifique sua internet e tente novamente."
            );

            return null;
        }

        await showAlert(
            "Erro no Login",
            "Não foi possível fazer o login. Tente novamente."
        );

        return null;
    }
}

/**
 * Realiza logout.
 */
export async function fazerLogout() {
    try {
        await signOut(auth);

        console.log("[Vitrine] Logout realizado.");

        return true;

    } catch (error) {
        console.error("[Vitrine] Erro no logout:", error);

        await showAlert(
            "Erro",
            "Ocorreu um erro ao tentar sair."
        );

        return false;
    }
}

/**
 * Abre o modal de autenticação.
 */
export function abrirModalLogin() {
    const modal = document.getElementById("modal-login");

    if (!modal) {
        console.warn(
            "[Vitrine] Modal #modal-login não encontrado."
        );
        return;
    }

    modal.style.display = "flex";
    modal.classList.add("ativo");
    modal.setAttribute("aria-hidden", "false");
}

/**
 * Fecha o modal depois que o login é concluído.
 */
export function fecharModalLogin() {
    const modal = document.getElementById("modal-login");

    if (!modal) return;

    modal.style.display = "none";
    modal.classList.remove("ativo");
    modal.setAttribute("aria-hidden", "true");
}
