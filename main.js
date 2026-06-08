// main.js (multiempresa revisado)
import { iniciarAuthListener, fazerLogin, fazerLogout, currentUser } from './vitrini-auth.js';
import { buscarEExibirAgendamentos, salvarAgendamento } from './vitrini-agendamento.js';
import { renderizarAgendamentosComoCards } from './vitrini-ui.js';

/**
 * Retorna o empresaId da empresa ativa do localStorage (multiempresa).
 */
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

/**
 * Obtém o profissional selecionado, podendo ser do contexto da empresa ativa,
 * ou do usuário logado, dependendo da lógica do seu app.
 * Aqui, por padrão, busca o UID do usuário logado.
 * Adapte se necessário para outros fluxos multiempresa.
 */
function getProfissionalUidAtivo(user) {
    // Exemplo: pode ser user.uid, ou buscar de um select, etc.
    // Para multiempresa, normalmente o profissional pertence à empresa ativa
    return user?.uid || null;
}

function atualizarUIparaUsuario(user) {
    const userInfo = document.getElementById('user-info');
    const empresaId = getEmpresaIdAtiva();

    if (user && empresaId) {
        userInfo.textContent = `Olá, ${user.displayName || 'Usuário'} | Empresa ativa: ${empresaId}`;
        // Buscar agendamentos para o profissional do usuário logado dentro da empresa ativa
        const profissionalUid = getProfissionalUidAtivo(user);
        buscarEExibirAgendamentos(empresaId, profissionalUid, 'ativos', renderizarAgendamentosComoCards);
    } else if (user) {
        userInfo.textContent = `Olá, ${user.displayName || 'Usuário'} | Nenhuma empresa ativa selecionada`;
    } else {
        userInfo.textContent = 'Você não está logado.';
    }
}

// Botões de login/logout
document.getElementById('btn-login').addEventListener('click', fazerLogin);
document.getElementById('btn-logout').addEventListener('click', fazerLogout);

// Listener de autenticação
iniciarAuthListener(atualizarUIparaUsuario);

// Confirmação de agendamento
document.getElementById('btn-confirmar-agendamento').addEventListener('click', () => {
    const empresaId = getEmpresaIdAtiva();
    const user = currentUser();
    const profissionalUid = getProfissionalUidAtivo(user);

    if (!empresaId) {
        alert('Nenhuma empresa ativa selecionada!');
        return;
    }
    if (!profissionalUid) {
        alert('Nenhum profissional selecionado!');
        return;
    }

    const data = document.getElementById('input-data').value;
    const horario = document.getElementById('input-horario').value;
    // Aqui, você pode montar o serviço real conforme seleção do usuário
    const servico = { id: 'serv1', nome: 'Corte de cabelo', duracao: 30, preco: 50 };
    salvarAgendamento(empresaId, profissionalUid, { data, horario, servico });
});
