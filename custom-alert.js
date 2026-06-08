// custom-alert.js
// Alerta customizado em JS puro, seguro para múltiplos usos, sem prejudicar nada do fluxo atual.

export function showCustomAlert({ title, message, onTrial, onClose }) {
    // Remove alerta antigo, se existir
    const existing = document.getElementById('custom-alert-backdrop');
    if (existing) existing.remove();

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'custom-alert-backdrop';
    Object.assign(backdrop.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
    });

    // Card
    const card = document.createElement('div');
    Object.assign(card.style, {
        background: '#fff',
        borderRadius: '16px',
        padding: '24px 18px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
        minWidth: '320px',
        maxWidth: '90vw',
        textAlign: 'center',
        border: '2px solid #0ec6d5',
        position: 'relative'
    });

    // Título
    const h3 = document.createElement('h3');
    h3.innerText = title || 'Ops! Não encontramos sua empresa';
    Object.assign(h3.style, {
        color: '#0ec6d5',
        marginBottom: '10px',
        fontWeight: '700',
        fontSize: '20px'
    });
    card.appendChild(h3);

    // Mensagem
    const msg = document.createElement('div');
    msg.innerText = message || 'Deseja experimentar a versão de teste gratuita agora?';
    Object.assign(msg.style, {
        marginBottom: '20px',
        color: '#444',
        fontSize: '16px'
    });
    card.appendChild(msg);

    // Botões
    const btns = document.createElement('div');
    Object.assign(btns.style, {
        display: 'flex',
        justifyContent: 'center',
        gap: '12px'
    });

    // Botão Trial
    const trialBtn = document.createElement('button');
    trialBtn.innerText = 'Usar versão de teste';
    Object.assign(trialBtn.style, {
        background: '#0ec6d5',
        color: '#fff',
        border: 'none',
        borderRadius: '5px',
        padding: '8px 20px',
        fontWeight: '600',
        fontSize: '15px',
        cursor: 'pointer'
    });
    trialBtn.onclick = (e) => {
        e.stopPropagation();
        if (onTrial) onTrial();
        backdrop.remove();
    };
    btns.appendChild(trialBtn);

    // Botão Cancelar
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancelar';
    Object.assign(cancelBtn.style, {
        background: 'transparent',
        color: '#0ec6d5',
        border: '2px solid #0ec6d5',
        borderRadius: '5px',
        padding: '8px 20px',
        fontWeight: '600',
        fontSize: '15px',
        cursor: 'pointer'
    });
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        if (onClose) onClose();
        backdrop.remove();
    };
    btns.appendChild(cancelBtn);

    card.appendChild(btns);

    // Previne fechamento ao clicar dentro do card
    card.onclick = (e) => e.stopPropagation();

    backdrop.appendChild(card);

    // Fecha ao clicar fora do card
    backdrop.onclick = (e) => {
        if (e.target === backdrop) {
            if (onClose) onClose();
            backdrop.remove();
        }
    };

    // Fecha ao pressionar ESC
    const escListener = (e) => {
        if (e.key === "Escape") {
            if (onClose) onClose();
            backdrop.remove();
            document.removeEventListener('keydown', escListener);
        }
    };
    document.addEventListener('keydown', escListener);

    document.body.appendChild(backdrop);

    // Foco automático no botão principal para acessibilidade
    setTimeout(() => {
        trialBtn.focus();
    }, 100);
}
