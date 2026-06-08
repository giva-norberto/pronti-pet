import { auth, provider } from './vitrini-firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { showAlert } from './vitrini-utils.js';

// MULTIEMPRESA: função utilitária para obter empresaId ativa, disponível para quem precisar
export function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

export function setupAuthListener(callback) {
    onAuthStateChanged(auth, user => {
        if (callback) callback(user);
    });
}

export async function fazerLogin() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Erro no login:", error.message);
        if (error.code !== 'auth/popup-closed-by-user') await showAlert("Erro no Login", "Não foi possível fazer o login. Tente novamente.");
    }
}

export async function fazerLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erro no logout:", error);
        await showAlert("Erro", "Ocorreu um erro ao tentar sair.");
    }
}

// Modal de login limpo
export function abrirModalLogin() {
    const modal = document.getElementById('modal-login');
    if (modal) modal.style.display = 'flex';
}
