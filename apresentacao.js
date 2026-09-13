(() => {
  'use strict';

  const ENDPOINT = 'https://southamerica-east1-pronti-pet.cloudfunctions.net/registrarEventoMarketing';
  const SESSION_KEY = 'pronti_pet_marketing_session';
  const thresholdsEnviados = new Set();

  function sessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function utm() {
    const q = new URLSearchParams(location.search);
    return {
      source: q.get('utm_source') || '',
      medium: q.get('utm_medium') || '',
      campaign: q.get('utm_campaign') || ''
    };
  }

  function rastrear(evento, extra = {}) {
    const dados = {
      evento,
      sessionId: sessionId(),
      path: location.pathname,
      referrer: document.referrer || '',
      ...utm(),
      ...extra
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
      keepalive: true,
      cache: 'no-store'
    }).catch(() => {});
  }

  const progress = document.getElementById('progress');
  function atualizarRolagem() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, scrollY / max * 100)) : 0;
    if (progress) progress.style.width = `${pct}%`;

    [25, 50, 75, 100].forEach((limite) => {
      if (pct >= limite && !thresholdsEnviados.has(limite)) {
        thresholdsEnviados.add(limite);
        rastrear(`scroll_${limite}`);
      }
    });
  }

  addEventListener('scroll', atualizarRolagem, { passive: true });
  atualizarRolagem();

  document.querySelectorAll('.faqQ').forEach((botao) => {
    botao.addEventListener('click', () => {
      const item = botao.closest('.faqItem');
      const resposta = item?.querySelector('.faqA');
      const estavaAberto = item?.classList.contains('open');

      document.querySelectorAll('.faqItem.open').forEach((aberto) => {
        aberto.classList.remove('open');
        const a = aberto.querySelector('.faqA');
        if (a) a.style.maxHeight = '0';
        aberto.querySelector('.faqQ')?.setAttribute('aria-expanded', 'false');
      });

      if (!estavaAberto && item && resposta) {
        item.classList.add('open');
        resposta.style.maxHeight = `${resposta.scrollHeight}px`;
        botao.setAttribute('aria-expanded', 'true');
        rastrear('faq_aberta');
      }
    });
  });

  document.querySelectorAll('.track-cta').forEach((link) => {
    link.addEventListener('click', () => {
      rastrear('cta_click', { detalhe: link.dataset.evento || 'cta' });
      sessionStorage.setItem('pronti_pet_origem_marketing', 'apresentacao');
    });
  });

  const menu = document.getElementById('shareMenu');
  const shareWa = document.getElementById('shareWa');
  const share = document.getElementById('shareBtn');
  const close = document.getElementById('close');
  const copy = document.getElementById('copy');

  share?.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('utm_source', 'compartilhamento');
    url.searchParams.set('utm_medium', 'whatsapp');
    if (shareWa) shareWa.href = `https://wa.me/?text=${encodeURIComponent(`Conheça o Pronti Pet: ${url.href}`)}`;
    menu?.classList.add('open');
    menu?.setAttribute('aria-hidden', 'false');
    rastrear('share_open');
  });

  close?.addEventListener('click', () => {
    menu?.classList.remove('open');
    menu?.setAttribute('aria-hidden', 'true');
  });

  menu?.addEventListener('click', (e) => {
    if (e.target === menu) close?.click();
  });

  shareWa?.addEventListener('click', () => rastrear('share_whatsapp'));

  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = 'Link copiado ✓';
      setTimeout(() => { copy.textContent = 'Copiar link'; }, 1800);
      rastrear('share_copy');
    } catch {
      prompt('Copie o link:', location.href);
    }
  });

  rastrear('page_view');
})();