// ======================================================================
//          VITRINI-STATE.JS - O Cérebro da Vitrine
//      Responsabilidade: Manter e gerenciar o estado global
//                      da aplicação de forma centralizada.
// ======================================================================

// O estado inicial da aplicação.
// MULTIEMPRESA: empresaId faz parte do estado e é sempre atualizado
// conforme o contexto.
export const state = {
    empresaId: null,
    dadosEmpresa: {},
    listaProfissionais: [],
    todosOsServicos: [],

    // Usuário autenticado no Firebase Authentication.
    currentUser: null,

    // ID verdadeiro do documento do cliente dentro da empresa.
    //
    // Pode ser:
    // - o próprio UID, para clientes antigos;
    // - um ID aleatório, para clientes cadastrados manualmente
    //   e posteriormente vinculados a uma conta.
    clienteId: null,

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
 *
 * @param {string} id - O ID da empresa.
 * @param {object} dados - Os dados do documento da empresa.
 */
export function setEmpresa(id, dados) {
    state.empresaId = id || null;
    state.dadosEmpresa = dados || {};
}

/**
 * Define a lista de profissionais.
 *
 * @param {Array<object>} profissionais - A lista de profissionais.
 */
export function setProfissionais(profissionais) {
    state.listaProfissionais =
        Array.isArray(profissionais)
            ? profissionais
            : [];
}

/**
 * Define a lista completa de todos os serviços oferecidos pela empresa.
 *
 * @param {Array<object>} servicos - A lista de todos os serviços.
 */
export function setTodosOsServicos(servicos) {
    state.todosOsServicos =
        Array.isArray(servicos)
            ? servicos
            : [];
}

/**
 * Define o usuário atualmente autenticado.
 *
 * Este objeto continua sendo o usuário do Firebase Authentication.
 * Ele não deve ser confundido com o ID do documento do cliente.
 *
 * @param {object|null} user - Objeto de usuário do Firebase Auth.
 */
export function setCurrentUser(user) {
    state.currentUser = user || null;

    /*
     * Ao sair da conta, também limpamos o cliente resolvido.
     * Isso evita que o cliente anterior permaneça no estado.
     */
    if (!state.currentUser) {
        state.clienteId = null;
    }
}

/**
 * Define o ID verdadeiro do documento do cliente.
 *
 * Caminho:
 * empresarios/{empresaId}/clientes/{clienteId}
 *
 * @param {string|null} clienteId
 */
export function setClienteId(clienteId) {
    state.clienteId =
        typeof clienteId === "string" &&
        clienteId.trim()
            ? clienteId.trim()
            : null;

    console.log(
        "[Vitrine] Cliente ativo definido:",
        state.clienteId
    );
}

/**
 * Retorna o ID ativo do cliente.
 *
 * Durante a transição, utiliza o UID autenticado como fallback para
 * manter compatibilidade com clientes antigos.
 *
 * @returns {string|null}
 */
export function getClienteIdAtivo() {
    return (
        state.clienteId ||
        state.currentUser?.uid ||
        null
    );
}

/**
 * Atualiza uma propriedade específica do objeto de agendamento.
 *
 * @param {string} propriedade - A chave a ser atualizada.
 * @param {*} valor - O novo valor da propriedade.
 */
export function setAgendamento(propriedade, valor) {
    if (propriedade in state.agendamento) {
        state.agendamento[propriedade] = valor;

        console.log(
            "Estado do agendamento atualizado:",
            state.agendamento
        );
    } else {
        console.error(
            `Propriedade de agendamento inválida: ${propriedade}`
        );
    }
}

/**
 * Reseta o estado do agendamento para os valores iniciais,
 * limpando as seleções.
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
 * Limpa somente o cliente resolvido.
 */
export function resetClienteId() {
    state.clienteId = null;
}

/**
 * Reseta o usuário autenticado e o cliente vinculado.
 */
export function resetCurrentUser() {
    state.currentUser = null;
    state.clienteId = null;
}
