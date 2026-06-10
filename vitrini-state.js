// ======================================================================
//          VITRINI-STATE.JS - O Cérebro da Vitrine
//      Responsabilidade: Manter e gerenciar o estado global
//                      da aplicação de forma centralizada.
// ======================================================================

// O estado inicial da aplicação.
// MULTIEMPRESA: empresaId faz parte do estado e é sempre atualizado conforme o contexto.
export const state = {
    empresaId: null,
    dadosEmpresa: {},
    listaProfissionais: [],
    todosOsServicos: [],
    currentUser: null,

    agendamento: {
        profissional: null,

        // PRONTI PET
        // Pet selecionado/cadastrado para calcular preço e duração por porte.
        pet: null,

        // Serviços selecionados.
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
    state.dadosEmpresa = dados || {};
}

/**
 * Define a lista de profissionais no estado.
 * @param {Array<object>} profissionais - A lista de profissionais.
 */
export function setProfissionais(profissionais) {
    state.listaProfissionais = Array.isArray(profissionais) ? profissionais : [];
}

/**
 * Define a lista completa de todos os serviços oferecidos pela empresa.
 * @param {Array<object>} servicos - A lista de todos os serviços.
 */
export function setTodosOsServicos(servicos) {
    state.todosOsServicos = Array.isArray(servicos) ? servicos : [];
}

/**
 * Define o usuário atualmente autenticado.
 * @param {object|null} user - O objeto de usuário do Firebase Auth.
 */
export function setCurrentUser(user) {
    state.currentUser = user || null;
}

/**
 * Atualiza uma propriedade específica do objeto de agendamento.
 * @param {string} propriedade - A chave a ser atualizada.
 * @param {*} valor - O novo valor para a propriedade.
 */
export function setAgendamento(propriedade, valor) {
    if (propriedade in state.agendamento) {
        state.agendamento[propriedade] = valor;
        console.log("Estado do agendamento atualizado:", state.agendamento);
    } else {
        console.error(`Propriedade de agendamento inválida: ${propriedade}`);
    }
}

/**
 * Reseta o estado do agendamento para os valores iniciais, limpando as seleções.
 */
export function resetarAgendamento() {
    state.agendamento = {
        profissional: null,
        pet: null,
        servicos: [],
        data: null,
        horario: null
    };

    console.log("Estado do agendamento resetado.");
}

/**
 * Reseta o usuário autenticado.
 */
export function resetCurrentUser() {
    state.currentUser = null;
}
