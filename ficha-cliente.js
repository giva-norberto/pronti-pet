// IMPORTAÇÕES do Firebase (corrigidas para a versão 10.12.2)
import { getFirestore, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./firebase-config.js";

// INICIALIZAÇÃO
const db = getFirestore(app);
const auth = getAuth(app);

// MULTIEMPRESA: Pega empresa ativa do localStorage
const empresaId = localStorage.getItem("empresaAtivaId");
if (!empresaId) {
    alert("Nenhuma empresa ativa selecionada!");
    window.location.href = "selecionar-empresa.html";
    throw new Error("Nenhuma empresa ativa selecionada.");
}

// Coleções multiempresa
const agendamentosCollection = collection(db, "empresarios", empresaId, "agendamentos");
const servicosCollection = collection(db, "empresarios", empresaId, "servicos");

// ELEMENTOS DA PÁGINA
const nomeClienteTitulo = document.getElementById('nome-cliente-titulo');
const historicoDiv = document.getElementById('historico-agendamentos');

// FUNÇÃO PRINCIPAL
async function carregarFichaDoCliente(user) {
    // 1. Pega o nome do cliente que foi passado na URL
    const urlParams = new URLSearchParams(window.location.search);
    const nomeCliente = urlParams.get('cliente');

    if (!nomeCliente) {
        nomeClienteTitulo.textContent = 'Cliente não encontrado';
        historicoDiv.innerHTML = '<p>Não foi possível identificar o cliente. Por favor, volte para a lista.</p>';
        return;
    }

    const nomeClienteDecodificado = decodeURIComponent(nomeCliente);
    nomeClienteTitulo.textContent = `Ficha de: ${nomeClienteDecodificado}`;
    historicoDiv.innerHTML = '<p>Buscando histórico de agendamentos...</p>';

    try {
        // 2. Busca o "mapa" de serviços
        const servicosSnapshot = await getDocs(servicosCollection);
        const servicosMap = new Map();
        servicosSnapshot.forEach(doc => {
            servicosMap.set(doc.id, doc.data());
        });

        // 3. Consulta o Firebase para buscar agendamentos
        const agendamentosQuery = query(
            agendamentosCollection, 
            where("cliente", "==", nomeClienteDecodificado),
            orderBy("horario", "desc")
        );
        const agendamentosSnapshot = await getDocs(agendamentosQuery);

        if (agendamentosSnapshot.empty) {
            historicoDiv.innerHTML = '<p>Nenhum agendamento encontrado para este cliente.</p>';
            return;
        }

        historicoDiv.innerHTML = ''; // Limpa a lista

        agendamentosSnapshot.forEach(doc => {
            const agendamento = doc.data();
            const servicoInfo = servicosMap.get(agendamento.servicoId);
            const nomeServico = servicoInfo ? servicoInfo.nome : 'Serviço Inválido';

            const dataHora = new Date(agendamento.horario);
            const dataFormatada = dataHora.toLocaleDateString('pt-BR');
            const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const agendamentoElemento = document.createElement('div');
            agendamentoElemento.classList.add('agendamento-item');
            agendamentoElemento.innerHTML = `
              <div class="agendamento-info">
                <h3>${nomeServico}</h3>
                <p><strong>Data:</strong> ${dataFormatada} às ${horaFormatada}</p>
              </div>
            `;
            historicoDiv.appendChild(agendamentoElemento);
        });

    } catch (error) {
        console.error("Erro ao buscar histórico do cliente:", error);
        historicoDiv.innerHTML = '<p style="color:red;">Ocorreu um erro ao carregar o histórico. Verifique o console.</p>';
    }
}

// AUTENTICAÇÃO OBRIGATÓRIA
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarFichaDoCliente(user);
    } else {
        // Redirecione para login, ou mostre mensagem
        historicoDiv.innerHTML = '<p style="color:red;">Você precisa estar autenticado para ver esta página.</p>';
        nomeClienteTitulo.textContent = "";
        window.location.href = "login.html"; // ou página de login do seu sistema
    }
});
