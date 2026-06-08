/**
 * clientes.js
 * Gerencia a exibição e manipulação de clientes para o empresário logado.
 * Utiliza lógica robusta para verificação e seleção automática de empresa.
 * Firebase Modular v10+
 */

// Importa as instâncias e funções necessárias do Firebase SDK
import { db, auth } from "./firebase-config.js";
import { collection, getDocs, query, where, orderBy, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// --- Referências aos Elementos do DOM ---
const listaClientesDiv = document.getElementById("lista-clientes");
// (Seu modal de confirmação, caso use o mesmo do exemplo anterior)
const modal = document.getElementById("modal-confirmacao"); 
const modalMensagem = document.getElementById("modal-mensagem");
const btnModalConfirmar = document.getElementById("btn-modal-confirmar");
const btnModalCancelar = document.getElementById("btn-modal-cancelar");

let empresaId = null;
let userUid = null;

// --- FUNÇÕES DE LÓGICA DE EMPRESA (Padrão do seu exemplo) ---

/**
 * Busca no Firestore todas as empresas associadas a um UID de usuário.
 * @param {string} uid - O UID do usuário logado.
 * @returns {Promise<Array>} Retorna um array de objetos de empresa.
 */
async function buscaEmpresasDoUsuario(uid) {
    // A consulta usa o campo "donoId" conforme seu exemplo
    const q = query(collection(db, "empresarios"), where("donoId", "==", uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

// --- PONTO DE ENTRADA E AUTENTICAÇÃO ---

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    userUid = user.uid;

    // 1. Tenta pegar a empresa ativa do cache (localStorage)
    empresaId = localStorage.getItem("empresaAtivaId");

    // 2. Se não houver empresa no cache, busca no banco de dados
    if (!empresaId) {
        exibirMensagemDeStatus("Verificando empresas...");
        const empresas = await buscaEmpresasDoUsuario(userUid);

        if (empresas.length === 0) {
            // Cenário 0: Nenhuma empresa encontrada
            alert("Você ainda não possui nenhuma empresa cadastrada. Cadastre uma para continuar.");
            window.location.href = 'cadastro-empresa.html'; // Redireciona para o cadastro
            return;
        }

        if (empresas.length === 1) {
            // Cenário 1: Apenas uma empresa, define como ativa automaticamente
            empresaId = empresas[0].id;
            localStorage.setItem("empresaAtivaId", empresaId);
        } else {
            // Cenário 2: Múltiplas empresas, precisa escolher
            alert("Você possui múltiplas empresas. Por favor, selecione uma para continuar.");
            window.location.href = 'selecionar-empresa.html'; // Redireciona para a seleção
            return;
        }
    }

    // 3. Com o empresaId garantido, inicializa a página
    inicializarPaginaClientes();
});

// --- LÓGICA DA PÁGINA DE CLIENTES ---

/**
 * Configura os listeners e carrega os dados iniciais.
 */
function inicializarPaginaClientes() {
    if (!empresaId) {
        console.error("Falha crítica: a inicialização da página foi chamada sem um ID de empresa.");
        exibirMensagemDeStatus("Erro ao carregar. ID da empresa não encontrado.");
        return;
    }
    configurarListenersDeAcao();
    carregarClientes();
}

/**
 * Carrega a lista de clientes do Firestore e a renderiza na tela.
 */
async function carregarClientes() {
    if (!listaClientesDiv) return;
    
    exibirMensagemDeStatus("Carregando clientes...");

    try {
        const clientesRef = collection(db, "empresarios", empresaId, "clientes");
        const q = query(clientesRef, orderBy("nome"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listaClientesDiv.innerHTML = '<p class="mensagem-info">Você ainda não cadastrou nenhum cliente.</p>';
            return;
        }

        listaClientesDiv.innerHTML = '';
        snapshot.forEach(docItem => {
            const cliente = docItem.data();
            const clienteId = docItem.id;

            const cardElement = document.createElement('div');
            cardElement.className = 'card';
            cardElement.setAttribute('data-id', clienteId);

            cardElement.innerHTML = `
                <div class="card-title">${cliente.nome || "Nome não informado"}</div>
                <div class="card-info">
                    <p><i class="fa-solid fa-phone"></i> ${cliente.telefone || "Não informado"}</p>
                    <p><i class="fa-solid fa-envelope"></i> ${cliente.email || "Não informado"}</p>
                </div>
                <div class="card-actions">
                    <a href="novo-cliente.html?id=${clienteId}" class="btn btn-edit" title="Editar ${cliente.nome}"><i class="fa-solid fa-pen"></i> Editar</a>
                    <button class="btn btn-remove" data-id="${clienteId}" title="Excluir ${cliente.nome}"><i class="fa-solid fa-trash"></i> Excluir</button>
                </div>
            `;
            listaClientesDiv.appendChild(cardElement);
        });

    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        exibirMensagemDeStatus("Ocorreu um erro inesperado ao carregar a lista de clientes.");
    }
}

/**
 * Exclui um cliente do Firestore após a confirmação do usuário.
 * @param {string} id - O ID do documento do cliente a ser excluído.
 */
async function excluirCliente(id) {
    const confirmado = confirm("Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.");
    
    if (confirmado) {
        try {
            const clienteDocRef = doc(db, "empresarios", empresaId, "clientes", id);
            await deleteDoc(clienteDocRef);
            
            // Remove o card da tela
            const itemRemovido = document.querySelector(`.card[data-id="${id}"]`);
            if (itemRemovido) itemRemovido.remove();

            alert("Cliente excluído com sucesso!");

        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            alert("Erro ao excluir o cliente. Tente novamente.");
        }
    }
}

/**
 * Configura o listener de eventos para os botões de ação (excluir).
 */
function configurarListenersDeAcao() {
    if (!listaClientesDiv) return;
    
    listaClientesDiv.addEventListener("click", async (event) => {
        const btnRemove = event.target.closest(".btn-remove");
        if (btnRemove) {
            const clienteId = btnRemove.dataset.id;
            if (clienteId) {
                await excluirCliente(clienteId);
            }
        }
    });
}

/**
 * Exibe uma mensagem de status na área de conteúdo.
 * @param {string} mensagem A mensagem a ser exibida.
 */
function exibirMensagemDeStatus(mensagem) {
    if (listaClientesDiv) {
        listaClientesDiv.innerHTML = `<p class="mensagem-info">${mensagem}</p>`;
    }
}
