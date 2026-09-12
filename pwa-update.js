(() => {
  'use strict';

  const CHAVE_VERSAO = 'pronti_pet_versao_instalada';
  const URL_VERSAO = '/version.json';

  let registroAtual = null;
  let versaoDisponivel = null;
  let atualizando = false;
  let recarregou = false;

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

  async function ativarNovaVersao() {
    if (atualizando || !registroAtual) return;
    const worker = registroAtual.waiting || registroAtual.installing;
    if (!worker) return;

    atualizando = true;

    if (worker.state === 'installed') {
      worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  }

  function observarInstalacao(registro) {
    registro.addEventListener('updatefound', () => {
      const novoWorker = registro.installing;
      if (!novoWorker) return;

      novoWorker.addEventListener('statechange', () => {
        if (novoWorker.state === 'installed' && navigator.serviceWorker.controller) {
          ativarNovaVersao();
        }
      });
    });
  }

  async function registrarWorker(versao) {
    const registro = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?v=${encodeURIComponent(versao)}`,
      { scope: '/', updateViaCache: 'none' }
    );

    registroAtual = registro;
    observarInstalacao(registro);
    await registro.update();

    if (registro.waiting && navigator.serviceWorker.controller) {
      await ativarNovaVersao();
    }
  }

  async function verificarAtualizacao() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    try {
      const versaoRemota = await buscarVersao();
      if (!versaoRemota) return;

      const versaoLocal = localStorage.getItem(CHAVE_VERSAO);
      versaoDisponivel = versaoRemota;

      if (!versaoLocal) {
        const jaEraControlado = Boolean(navigator.serviceWorker.controller);
        await registrarWorker(versaoRemota);
        if (!jaEraControlado) localStorage.setItem(CHAVE_VERSAO, versaoRemota);
        return;
      }

      if (versaoRemota === versaoLocal) {
        if (!registroAtual) await registrarWorker(versaoRemota);
        return;
      }

      await registrarWorker(versaoRemota);
      if (registroAtual?.waiting) await ativarNovaVersao();
    } catch (erro) {
      atualizando = false;
      console.warn('[Pronti Pet] Verificação automática de atualização indisponível:', erro);
    }
  }

  navigator.serviceWorker?.addEventListener('controllerchange', async () => {
    if (recarregou) return;
    recarregou = true;

    if (versaoDisponivel) localStorage.setItem(CHAVE_VERSAO, versaoDisponivel);

    try {
      await limparCachesPronti();
    } catch (erro) {
      console.warn('[Pronti Pet] Não foi possível limpar cache antigo:', erro);
    }

    recarregarComVersao();
  });

  window.addEventListener('load', verificarAtualizacao, { once: true });
})();
