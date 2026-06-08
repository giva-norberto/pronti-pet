// =================================================================
//          ARQUIVO DEDICADO AO CONTROLE DO MENU MOBILE
//          (menu-mobile.js)
// =================================================================

// Este script roda assim que o documento HTML básico estiver pronto.
document.addEventListener('DOMContentLoaded', () => {
  // Seleciona os elementos essenciais do menu uma única vez.
  const hamburgerBtn = document.getElementById('sidebar-hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const body = document.body;

  // Verifica se todos os elementos necessários existem.
  if (!hamburgerBtn || !sidebar || !overlay) {
    console.error("Erro crítico: Um ou mais elementos do menu (hambúrguer, sidebar, overlay) não foram encontrados no HTML.");
    return; // Interrompe a execução se algo estiver faltando.
  }

  // Função para fechar o menu
  function closeMenu() {
    sidebar.classList.remove('show');
    hamburgerBtn.classList.remove('active');
    overlay.classList.remove('show');
    body.classList.remove('menu-open'); // Libera o scroll do corpo da página
    hamburgerBtn.setAttribute('aria-label', 'Abrir menu');
  }

  // Função para abrir o menu
  function openMenu() {
    sidebar.classList.add('show');
    hamburgerBtn.classList.add('active');
    overlay.classList.add('show');
    body.classList.add('menu-open'); // Trava o scroll do corpo da página
    hamburgerBtn.setAttribute('aria-label', 'Fechar menu');
  }

  // Adiciona o evento de clique ao botão hambúrguer.
  hamburgerBtn.addEventListener('click', (event) => {
    event.stopPropagation(); // Impede que o clique se propague para outros elementos.
    // Verifica se o menu está aberto para decidir se deve abrir ou fechar.
    if (sidebar.classList.contains('show')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Adiciona o evento de clique ao overlay (fundo escuro) para fechar o menu.
  overlay.addEventListener('click', closeMenu);

  // BÔNUS: Permite fechar o menu com a tecla "Escape".
  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && sidebar.classList.contains('show')) {
      closeMenu();
    }
  });
});
