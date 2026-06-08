// Importa a função de listener de autenticação do arquivo central de auth
import { setupAuthListener } from './vitrini-auth.js';

// --------- MULTIEMPRESA: obtém empresaId ativa se necessário ---------
function getEmpresaIdAtiva() {
  return localStorage.getItem("empresaAtivaId") || null;
}

// --------- EXIBE O MODAL QUANDO NÃO LOGADO ---------
setupAuthListener(async (user) => {
  // Se necessário, pode acessar empresaId com getEmpresaIdAtiva()
  if (!user) {
    if (typeof showModalAuth === "function") showModalAuth();
    if (typeof showStep === "function") showStep('login');
  } else {
    if (typeof hideModalAuth === "function") hideModalAuth();
  }
});

// --------- EVENTOS E TROCA DE TELA ---------
window.addEventListener('DOMContentLoaded', () => {
  const btnToCadastro = document.getElementById('modal-auth-btn-to-cadastro');
  const btnToLogin = document.getElementById('modal-auth-btn-to-login');
  const btnGoogle = document.getElementById('modal-auth-btn-google');
  const formLogin = document.getElementById('modal-auth-form-login');
  const formCadastro = document.getElementById('modal-auth-form-cadastro');

  if (btnToCadastro) btnToCadastro.onclick = () => showStep && showStep('cadastro');
  if (btnToLogin) btnToLogin.onclick = () => showStep && showStep('login');
  if (btnGoogle) btnGoogle.onclick = () => handleLoginGoogle && handleLoginGoogle();
  if (formLogin) formLogin.onsubmit = (event) => handleLoginEmail && handleLoginEmail(event);
  if (formCadastro) formCadastro.onsubmit = (event) => handleCadastro && handleCadastro(event);
});
