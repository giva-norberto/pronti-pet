// Importa a função de listener de autenticação
import { setupAuthListener } from './vitrini-auth.js';

// --------- MULTIEMPRESA ---------
function getEmpresaIdAtiva() {
  return localStorage.getItem("empresaAtivaId") || null;
}

// --------- CONTROLE DO MODAL ---------
setupAuthListener((user) => {
  const empresaId = getEmpresaIdAtiva();

  if (!user) {
    console.log("[Vitrine] Cliente não autenticado.", { empresaId });
    return;
  }

  if (typeof window.hideModalAuth === "function") {
    window.hideModalAuth();
  }
});

// --------- EVENTOS E TROCA DE TELA ---------
window.addEventListener('DOMContentLoaded', () => {
  const btnToCadastro = document.getElementById('modal-auth-btn-to-cadastro');
  const btnToLogin = document.getElementById('modal-auth-btn-to-login');
  const btnGoogle = document.getElementById('modal-auth-btn-google');
  const formLogin = document.getElementById('modal-auth-form-login');
  const formCadastro = document.getElementById('modal-auth-form-cadastro');

  if (btnToCadastro) {
    btnToCadastro.onclick = () => {
      if (typeof window.showStep === "function") {
        window.showStep('cadastro');
      }
    };
  }

  if (btnToLogin) {
    btnToLogin.onclick = () => {
      if (typeof window.showStep === "function") {
        window.showStep('login');
      }
    };
  }

  if (btnGoogle) {
    btnGoogle.onclick = () => {
      if (typeof window.handleLoginGoogle === "function") {
        window.handleLoginGoogle();
      }
    };
  }

  if (formLogin) {
    formLogin.onsubmit = (event) => {
      if (typeof window.handleLoginEmail === "function") {
        window.handleLoginEmail(event);
      }
    };
  }

  if (formCadastro) {
    formCadastro.onsubmit = (event) => {
      if (typeof window.handleCadastro === "function") {
        window.handleCadastro(event);
      }
    };
  }
});
