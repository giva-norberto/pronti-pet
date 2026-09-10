(() => {
  'use strict';

  const CHAVE_VERSAO = 'pronti_pet_versao_instalada';
  const CHAVE_AVISO_SESSAO = 'pronti_pet_update_aviso_sessao';
  const URL_VERSAO = '/version.json';
  const INTERVALO_VERIFICACAO = 60 * 60 * 1000;

  let registroAtual = null;
  let versaoDisponivel = null;
  let atualizando = false;
  let modalCriado = false;

  function estaNoIndex() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/' || path === '/index.html';
  }

  function avisoJaMostradoNestaSessao(versao) {
    return sessionStorage.getItem(CHAVE_AVISO_SESSAO) === String(versao || '');
  }

  function marcarAvisoNestaSessao(versao) {
    if (versao) sessionStorage.setItem(CHAVE_AVISO_SESSAO, String(versao));
  }

  function criarModal() {
    if (modalCriado) return;
    modalCriado = true;

    const estilo = document.createElement('style');
    estilo.textContent = `
      .pronti-update-bg {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(23, 17, 61, .64);
        backdrop-filter: blur(4px);
      }
      .pronti-update-bg.active { display: flex; }
      .pronti-update-card {
        width: 100%;
        max-width: 390px;
        padding: 24px 20px 20px;
        border-radius: 24px;
        background: #fff;
        text-align: center;
        box-shadow: 0 24px 60px rgba(32, 16, 66, .30);
        font-family: 'Poppins', Arial, sans-serif;
      }
      .pronti-update-icon {
        width: 62px;
        height: 62px;
        margin: 0 auto 12px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f3edff;
        color: #5522b6;
        font-size: 32px;
      }
      .pronti-update-card h3 {
        margin: 0 0 8px;
        color: #17113d;
        font-size: 22px;
        font-weight: 800;
      }
      .pronti-update-card p {
        margin: 0;
        color: #726b86;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
      }
      .pronti-update-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 18px;
      }
      .pronti-update-btn {
        min-height: 48px;
        border: 0;
        border-radius: 15px;
        padding: 12px 10px;
        font: inherit;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .pronti-update-btn.later {
        background: #f1eef8;
        color: #17113d;
      }
      .pronti-update-btn.now {
        background: linear-gradient(135deg, #5522b6, #7140dc);
        color: #fff;
      }
      .pronti-update-btn:disabled {
        opacity: .65;
        cursor: wait;
      }
    `;

    const modal = document.createElement('div');
    modal.id = 'prontiUpdateModal';
    modal.className = 'pronti-update-bg';
    modal.innerHTML = `
      <div class="pronti-update-card" role="dialog" aria-modal="true" aria-labelledby="prontiUpdateTitulo">
        <div class="pronti-update-icon">✨</div>
        <h3 id="prontiUpdateTitulo">Nova versão disponível</h3>
        <p>O Pronti Pet recebeu melhorias.<br>Atualize agora para carregar a versão nova e limpar o cache antigo.</p>
        <div class="pronti-update-actions">
          <button id="prontiUpdateDepois" class="pronti-update-btn later">Depois</button>
          <button id="prontiUpdateAgora" class="pronti-update-btn now">Atualizar agora</button>
        </div>
      </div>
    `;

    document.head.appendChild(estilo);
    document.body.appendChild(modal);

    document.getElementById('prontiUpdateDepois')?.addEventListener('click', () => {
      marcarAvisoNestaSessao(versaoDisponivel);
      esconderModal();
    });
    document.getElementById('prontiUpdateAgora')?.addEventListener('click', atualizarAgora);
  }

  function mostrarModal() {
    if (!estaNoIndex() || avisoJaMostradoNestaSessao(versaoDisponivel)) return;
    marcarAvisoNestaSessao(versaoDisponivel);
    criarModal();
    document.getElementById('prontiUpdateModal')?.classList.add('active');
  }

  function esconderModal() {
    document.getElementById('prontiUpdateModal')?.classList.remove('active');
  }

  async function limparCachesPronti() {
    if (!('caches' in window)) return;
    const chaves = await caches.keys();
    await Promise.all(
      chaves
        .filter((chave) => chave.startsWith('pronti-pet-'))
        .map((chave) => caches.delete(chave))
    );
  }

  function recarregarComVersao() {
    const url = new URL(window.location.href);
    url.searchParams.set('v', versaoDisponivel || String(Date.now()));
    window.location.replace(url.href);
  }

  async function buscarVersao() {
    const resposta = await fetch(`${URL_VERSAO}?t=${Date.now()}`, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`Falha ao consultar versão: ${resposta.status}`);
    const dados = await resposta.json();
    return String(dados.version || '').trim();
  }

  function observarInstalacao(registro) {
    registro.addEventListener('updatefound', () => {
      const novoWorker = registro.installing;
      if (!novoWorker) return;

      novoWorker.addEventListener('statechange', () => {
        if (
          novoWorker.state === 'installed' &&
          navigator.serviceWorker.controller &&
          versaoDisponivel
        ) {
          mostrarModal();
        }
      });
    });
  }

  async function registrarWorker(versao) {
    const urlWorker = `/firebase-messaging-sw.js?v=${encodeURIComponent(versao)}`;
    const registro = await navigator.serviceWorker.register(urlWorker, {
      scope: '/',
      updateViaCache: 'none'
    });

    registroAtual = registro;
    observarInstalacao(registro);
    await registro.update();

    if (registro.waiting && navigator.serviceWorker.controller) {
      mostrarModal();
    }

    return registro;
  }

  async function verificarAtualizacao() {
    if (!estaNoIndex()) return;
    if (atualizando || !('serviceWorker' in navigator) || !window.isSecureContext) return;

    try {
      const versaoRemota = await buscarVersao();
      if (!versaoRemota) return;

      const versaoLocal = localStorage.getItem(CHAVE_VERSAO);
      versaoDisponivel = versaoRemota;

      if (!versaoLocal) {
        const jaEraControlado = Boolean(navigator.serviceWorker.controller);
        await registrarWorker(versaoRemota);

        if (!jaEraControlado) {
          localStorage.setItem(CHAVE_VERSAO, versaoRemota);
        } else if (registroAtual?.waiting) {
          mostrarModal();
        }
        return;
      }

      if (versaoRemota === versaoLocal) {
        if (!registroAtual) await registrarWorker(versaoRemota);
        return;
      }

      await registrarWorker(versaoRemota);
      if (registroAtual?.waiting) mostrarModal();
    } catch (erro) {
      console.warn('[Pronti Pet] Verificação de atualização indisponível:', erro);
    }
  }

  async function atualizarAgora() {
    if (atualizando) return;
    atualizando = true;

    marcarAvisoNestaSessao(versaoDisponivel);

    const botao = document.getElementById('prontiUpdateAgora');
    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Atualizando...';
    }

    try {
      if (!registroAtual && versaoDisponivel) {
        await registrarWorker(versaoDisponivel);
      }

      const worker = registroAtual?.waiting || registroAtual?.installing;

      if (worker?.state === 'installed') {
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      if (worker) {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
        return;
      }

      await limparCachesPronti();
      if (versaoDisponivel) localStorage.setItem(CHAVE_VERSAO, versaoDisponivel);
      recarregarComVersao();
    } catch (erro) {
      atualizando = false;
      if (botao) {
        botao.disabled = false;
        botao.textContent = 'Atualizar agora';
      }
      console.error('[Pronti Pet] Não foi possível atualizar:', erro);
    }
  }

  let recarregou = false;
  navigator.serviceWorker?.addEventListener('controllerchange', async () => {
    if (recarregou) return;
    recarregou = true;

    if (versaoDisponivel) {
      localStorage.setItem(CHAVE_VERSAO, versaoDisponivel);
    }

    try {
      await limparCachesPronti();
    } catch (erro) {
      console.warn('[Pronti Pet] Não foi possível limpar cache antigo:', erro);
    }

    recarregarComVersao();
  });

  if (estaNoIndex()) {
    window.addEventListener('load', verificarAtualizacao, { once: true });
    window.setInterval(verificarAtualizacao, INTERVALO_VERIFICACAO);
  }
})();
