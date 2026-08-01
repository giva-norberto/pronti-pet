// ======================================================================
//          VITRINE-AUTH-MODAL.JS — PRONTI PET
// ======================================================================

// Importa o listener de autenticação central da vitrine
import { setupAuthListener } from './vitrini-auth.js';

// --------- MULTIEMPRESA: EMPRESA DO PET SHOP ---------
function getEmpresaIdAtiva() {
  return localStorage.getItem('empresaAtivaId') || null;
}

// --------- CONTROLE DO MODAL DE LOGIN ---------
setupAuthListener(async (user) => {
  const empresaId = getEmpresaIdAtiva();

  if (!user) {
    console.log('[Pronti Pet] Cliente não autenticado.', {
      empresaId
    });

    if (typeof showModalAuth === 'function') {
      showModalAuth();
    }

    if (typeof showStep === 'function') {
      showStep('login');
    }

    return;
  }

  console.log('[Pronti Pet] Cliente autenticado.', {
    uid: user.uid,
    empresaId
  });

  if (typeof hideModalAuth === 'function') {
    hideModalAuth();
  }
});

// --------- EVENTOS DO MODAL ---------
window.addEventListener('DOMContentLoaded', () => {
  const btnToCadastro =
    document.getElementById('modal-auth-btn-to-cadastro');

  const btnToLogin =
    document.getElementById('modal-auth-btn-to-login');

  const formLogin =
    document.getElementById('modal-auth-form-login');

  const formCadastro =
    document.getElementById('modal-auth-form-cadastro');

  if (btnToCadastro) {
    btnToCadastro.onclick = () => {
      if (typeof showStep === 'function') {
        showStep('cadastro');
      }
    };
  }

  if (btnToLogin) {
    btnToLogin.onclick = () => {
      if (typeof showStep === 'function') {
        showStep('login');
      }
    };
  }

  if (formLogin) {
    formLogin.onsubmit = (event) => {
      if (typeof handleLoginEmail === 'function') {
        handleLoginEmail(event);
      }
    };
  }

  if (formCadastro) {
    formCadastro.onsubmit = (event) => {
      if (typeof handleCadastro === 'function') {
        handleCadastro(event);
      }
    };
  }
});
