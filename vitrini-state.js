// ======================================================================
//          VITRINI-STATE.JS - O Cérebro da Vitrine
//      Responsabilidade: Manter e gerenciar o estado global
//                      da aplicação de forma centralizada.
// ======================================================================

// O estado inicial da nossa aplicação.
// MULTIEMPRESA: empresaId faz parte do estado e é sempre atualizado conforme o contexto.
export const state = {
    empresaId: null,
    dadosEmpresa: {},
    listaProfissionais: [],
    todosOsServicos: [],
    currentUser: null,
    agendamento: {
        profissional: null,
        // ==========================================================
        //   CORREÇÃO PRINCIPAL APLICADA AQUI
        //   - 'servico' (singular) foi trocado por 'servicos' (plural)
        //   - Agora é um array para armazenar múltiplos serviços.
        // ==========================================================
        servicos: [],
        data: null,
        horario: null
    }
};

/**
 * Define os dados da empresa no estado.
 * @param {string} id - O ID da empresa.
 * @param {object} dados - Os dados do documento da empresa.
 */
export function setEmpresa(id, dados) {
    state.empresaId = id;
    state.dadosEmpresa = dados;
}

/**
 * Define a lista de profissionais no estado.
 * @param {Array<object>} profissionais - A lista de profissionais.
 */
export function setProfissionais(profissionais) {
    state.listaProfissionais = profissionais;
}

/**
 * Define a lista completa de todos os serviços oferecidos pela empresa.
 * @param {Array<object>} servicos - A lista de todos os serviços.
 */
export function setTodosOsServicos(servicos) {
    state.todosOsServicos = servicos;
}

/**
 * Define o usuário atualmente autenticado.
 * @param {object|null} user - O objeto de usuário do Firebase Auth.
 */
export function setCurrentUser(user) {
    state.currentUser = user;
}

/**
 * Atualiza uma propriedade específica do objeto de agendamento.
 * @param {string} propriedade - A chave a ser atualizada (ex: 'profissional', 'servicos').
 * @param {*} valor - O novo valor para a propriedade.
 */
export function setAgendamento(propriedade, valor) {
    // Esta verificação agora permite a propriedade 'servicos'.
    if (propriedade in state.agendamento) {
        state.agendamento[propriedade] = valor;
        console.log(`Estado do agendamento atualizado:`, state.agendamento);
    } else {
        // O erro que você viu não deve mais acontecer.
        console.error(`Propriedade de agendamento inválida: ${propriedade}`);
    }
}

/**
 * Reseta o estado do agendamento para os valores iniciais, limpando as seleções.
 */
export function resetarAgendamento() {
    state.agendamento = {
        profissional: null,
        servicos: [], // Resetado para um array vazio
        data: null,
        horario: null
    };
    console.log("Estado do agendamento resetado.");
}

/**
 * Reseta o usuário autenticado (útil para logout).
 */
export function resetCurrentUser() {
    state.currentUser = null;
}
