// Funções de utilidade geral, como modais e alertas.

export function getEmpresaIdAtiva() {
    return localStorage.getItem('empresaAtivaId') || null;
}

/**
 * Função principal que controla o modal, tornando-o visível e configurando seus botões.
 * @param {string} title - Título do modal.
 * @param {string} message - Mensagem do modal.
 * @param {Array<object>} buttons - Array com a configuração dos botões.
 * @returns {Promise<any>} - Retorna o valor associado ao botão clicado.
 */
export function showModal(title, message, buttons) {
    return new Promise(resolve => {
        const overlay = document.getElementById('custom-confirm-modal');
        const titleEl = document.getElementById('modal-titulo');
        const messageEl = document.getElementById('modal-mensagem');
        const buttonsContainer = document.querySelector('.modal-botoes');

        if (!overlay || !titleEl || !messageEl || !buttonsContainer) {
            console.error("Elementos do modal não encontrados no DOM. Verifique seu HTML.");
            return resolve(false);
        }

        // Limpa event listeners antigos (boa prática para evitar multiplicaçao de eventos)
        while (buttonsContainer.firstChild) {
            buttonsContainer.removeChild(buttonsContainer.firstChild);
        }

        titleEl.textContent = title;
        // Permitir HTML na mensagem (para <br> e afins)
        messageEl.innerHTML = message;

        const close = (value) => {
            overlay.classList.remove('ativo');
            overlay.style.display = "none";
            resolve(value);
        };

        buttons.forEach(buttonInfo => {
            const button = document.createElement('button');
            button.id = buttonInfo.id;
            button.textContent = buttonInfo.text;
            button.type = 'button';
            button.addEventListener('click', () => close(buttonInfo.value));
            buttonsContainer.appendChild(button);
        });

        overlay.style.display = "flex"; // Garante exibição no padrão Pronti
        overlay.classList.add('ativo');
    });
}

export function showAlert(title, message) {
    const buttons = [
        { text: 'OK', id: 'modal-btn-confirmar', value: true }
    ];
    return showModal(title, message, buttons);
}

export function showCustomConfirm(title, message) {
    const buttons = [
        { text: 'Cancelar', id: 'modal-btn-cancelar', value: false },
        { text: 'Confirmar', id: 'modal-btn-confirmar', value: true }
    ];
    return showModal(title, message, buttons);
}
