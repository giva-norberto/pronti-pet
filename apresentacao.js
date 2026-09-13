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

  function otimizarConversao() {
    const configuracao = {
      cta_topo: { texto: 'Criar conta grátis', href: './cadastro.html' },
      cta_hero: { texto: 'Começar grátis agora →', href: './cadastro.html' },
      cta_meio: { texto: 'Criar conta grátis →', href: './cadastro.html' },
      cta_final: { texto: 'Criar conta grátis →', href: './cadastro.html' }
    };

    Object.entries(configuracao).forEach(([evento, cfg]) => {
      const link = document.querySelector(`.track-cta[data-evento="${evento}"]`);
      if (!link) return;
      link.href = cfg.href;
      link.textContent = cfg.texto;
      link.setAttribute('aria-label', cfg.texto.replace('→', '').trim());
    });

    const heroActions = document.querySelector('.hero .actions');
    if (heroActions && !document.getElementById('conversion-trust')) {
      const trust = document.createElement('div');
      trust.id = 'conversion-trust';
      trust.className = 'conversion-trust';
      trust.textContent = '✓ Teste grátis  •  ✓ Instalação grátis no celular  •  ✓ Sem loja de aplicativos';
      heroActions.insertAdjacentElement('afterend', trust);
    }

    if (!document.getElementById('conversion-sticky')) {
      const sticky = document.createElement('a');
      sticky.id = 'conversion-sticky';
      sticky.className = 'track-cta conversion-sticky';
      sticky.dataset.evento = 'cta_sticky';
      sticky.href = './cadastro.html';
      sticky.textContent = 'Criar conta grátis';
      sticky.setAttribute('aria-label', 'Criar conta grátis no Pronti Pet');
      document.body.appendChild(sticky);
    }

    if (!document.getElementById('conversion-style')) {
      const style = document.createElement('style');
      style.id = 'conversion-style';
      style.textContent = `
        .conversion-trust{margin-top:14px;color:#eee8ff;font-size:.86rem;font-weight:750;line-height:1.45}
        .conversion-sticky{display:none}
        @media(max-width:700px){
          body{padding-bottom:78px}
          .conversion-sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:140;display:flex;align-items:center;justify-content:center;min-height:54px;padding:0 18px;border-radius:15px;background:linear-gradient(135deg,#5627c8,#8259ec);color:#fff;font-weight:900;text-decoration:none;box-shadow:0 14px 34px rgba(44,21,111,.34);border:1px solid rgba(255,255,255,.24)}
          .conversion-trust{font-size:.78rem;margin-top:12px}
          .fab{bottom:82px;width:50px;height:50px}
        }
      `;
      document.head.appendChild(style);
    }
  }

  otimizarConversao();

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