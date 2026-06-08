// --- IMPORTAÇÕES ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { servicos as mockServicos, agendamentos as mockAgendamentos } from "./dados.js";

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCnGK3j90_UpBdRpu5nhSs-nY84I_e0cAk",
  authDomain: "pronti-app-37c6e.firebaseapp.com",
  projectId: "pronti-app-37c6e",
  storageBucket: "pronti-app-37c6e.firebasestorage.app",
  messagingSenderId: "736700619274",
  appId: "1:736700619274:web:557aa247905e56fa7e5df3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// MULTIEMPRESA: obtém empresaId da empresa ativa do localStorage
function getEmpresaIdAtiva() {
  return localStorage.getItem("empresaAtivaId") || null;
}

// --- ELEMENTOS GLOBAIS ---
const pageContent = document.getElementById('page-content');
const navLinks = document.querySelectorAll('.sidebar-links a');

// --- CARREGADORES DE PÁGINA ---

async function carregarServicos() {
  pageContent.innerHTML = '<h1>Nossos Serviços</h1><div id="lista-servicos">Carregando...</div>';
  const listaServicosDiv = document.getElementById('lista-servicos');

  // MULTIEMPRESA: busca serviços dentro do contexto da empresa ativa
  const empresaId = getEmpresaIdAtiva();
  if (!empresaId) {
    listaServicosDiv.innerHTML = '<p style="color:red;">Nenhuma empresa ativa selecionada.</p>';
    return;
  }
  const servicosCollection = collection(db, "empresarios", empresaId, "servicos");

  try {
    const snapshot = await getDocs(servicosCollection);
    if (snapshot.empty) {
      listaServicosDiv.innerHTML = '<p>Nenhum serviço encontrado no Firebase.</p>';
      return;
    }

    listaServicosDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const servico = doc.data();
      const el = document.createElement('div');
      el.className = 'servico-item';
      el.innerHTML = `<h3>${servico.nome}</h3><p>Preço: R$ ${servico.preco.toFixed(2)}</p>`;
      listaServicosDiv.appendChild(el);
    });
  } catch (error) {
    console.error("ERRO AO BUSCAR SERVIÇOS:", error);
    listaServicosDiv.innerHTML = '<p style="color:red;">Falha ao carregar serviços. Verifique o console.</p>';
  }
}

function carregarHome() {
  pageContent.innerHTML = '<h1>Bem-vindo ao Pronti!</h1><p>Use o menu para navegar.</p>';
}

function carregarAgenda() {
  pageContent.innerHTML = '<h1>Agenda</h1><p>Funcionalidade de agenda em breve.</p>';
}

function carregarClientes() {
    pageContent.innerHTML = '<h1>Clientes</h1><p>Funcionalidade de clientes em breve.</p>';
}


// --- ROTEADOR SIMPLES ---
function navigate(page) {
  // Atualiza o link ativo no menu
  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Carrega o conteúdo da página
  if (page === 'home') carregarHome();
  else if (page === 'servicos') carregarServicos();
  else if (page === 'agenda') carregarAgenda();
  else if (page === 'clientes') carregarClientes();
}

// --- INICIALIZAÇÃO ---
// Adiciona o evento de clique nos links do menu
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault(); // Impede o link de recarregar a página
    const page = e.target.dataset.page;
    navigate(page);
  });
});

// Carrega a página inicial por padrão
carregarHome();
