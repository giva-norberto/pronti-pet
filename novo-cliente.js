// --- IMPORTS ---
import { db, auth } from "./firebase-config.js";

// CORRIGIDO: Versão do Firebase atualizada para 10.13.2 para ser consistente com o seu firebase-config.js
import { doc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";


// --- ELEMENTOS DO DOM ---
const form = document.getElementById('form-cliente');
const formTitulo = document.getElementById('form-titulo');
const formSubtitulo = document.getElementById('form-subtitulo');
const btnSalvar = document.getElementById('btn-salvar');
const btnExcluir = document.getElementById('btn-excluir');

// --- VARIÁVEIS DE ESTADO ---
let empresaId = null;
let clienteId = null;
let userUid = null;
let isEditing = false;

// --- FUNÇÕES AUXILIARES ---

function mostrarToast(texto, cor) {
  if (typeof Toastify !== "undefined") {
    Toastify({
      text: texto,
      duration: 4000,
      gravity: "top",
      position: "right",
      style: { background: cor, color: "white" }
    }).showToast();
  } else {
    alert(texto);
  }
}

async function buscaEmpresasDoUsuario(uid) {
    const q = query(collection(db, "empresarios"), where("donoId", "==", uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

function configurarModoEdicao() {
    if (formTitulo) formTitulo.textContent = 'Editar Cliente';
    if (formSubtitulo) formSubtitulo.textContent = 'Altere os dados do cliente abaixo.';
    if (btnSalvar) btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Atualizar Cliente';
    if (btnExcluir) {
        btnExcluir.style.display = 'inline-block';
    }
}

async function carregarDadosCliente() {
    try {
        const clienteRef = doc(db, "empresarios", empresaId, "clientes", clienteId);
        const docSnap = await getDoc(clienteRef);
        if (docSnap.exists()) {
            const cliente = docSnap.data();
            document.getElementById('nome-cliente').value = cliente.nome || '';
            document.getElementById('telefone-cliente').value = cliente.telefone || '';
            document.getElementById('email-cliente').value = cliente.email || '';
        } else {
            mostrarToast("Cliente não encontrado. Você será redirecionado.", "#ef4444");
            setTimeout(() => { window.location.href = 'clientes.html'; }, 2000);
        }
    } catch (error) {
        console.error("Erro ao carregar dados do cliente:", error);
        mostrarToast("Ocorreu um erro ao buscar os dados do cliente.", "#ef4444");
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const nome = document.getElementById('nome-cliente').value.trim();
    const telefone = document.getElementById('telefone-cliente').value.trim();
    const email = document.getElementById('email-cliente').value.trim();

    if (!nome) {
        mostrarToast("O campo 'Nome Completo' é obrigatório.", "#ef4444");
        return;
    }

    const dadosCliente = { 
        nome, 
        telefone, 
        email,
        atualizadoEm: serverTimestamp() 
    };

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Salvando...';
    }

    try {
        if (isEditing) {
            const clienteRef = doc(db, "empresarios", empresaId, "clientes", clienteId);
            await updateDoc(clienteRef, dadosCliente);
            mostrarToast("Cliente atualizado com sucesso!", "#22c55e");
        } else {
            dadosCliente.criadoEm = serverTimestamp();
            const clientesCollectionRef = collection(db, "empresarios", empresaId, "clientes");
            await addDoc(clientesCollectionRef, dadosCliente);
            mostrarToast("Cliente cadastrado com sucesso!", "#22c55e");
        }
        setTimeout(() => { window.location.href = 'clientes.html'; }, 1500);
    } catch (error) {
        console.error("Erro ao salvar cliente:", error);
        mostrarToast("Ocorreu um erro ao salvar o cliente.", "#ef4444");
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = isEditing ? '<i class="fa-solid fa-save"></i> Atualizar Cliente' : '<i class="fa-solid fa-save"></i> Salvar Cliente';
        }
    }
}

async function handleExcluirCliente() {
    if (!confirm("Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.")) {
        return;
    }
    try {
        const clienteRef = doc(db, "empresarios", empresaId, "clientes", clienteId);
        await deleteDoc(clienteRef);
        mostrarToast("Cliente excluído com sucesso!", "#22c55e");
        setTimeout(() => { window.location.href = 'clientes.html'; }, 1500);
    } catch (error) {
        console.error("Erro ao excluir cliente:", error);
        mostrarToast("Ocorreu um erro ao excluir o cliente.", "#ef4444");
    }
}

// --- LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO DA PÁGINA ---

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    userUid = user.uid;
    empresaId = localStorage.getItem("empresaAtivaId");

    if (!empresaId) {
        const empresas = await buscaEmpresasDoUsuario(userUid);
        if (empresas.length === 1) {
            empresaId = empresas[0].id;
            localStorage.setItem("empresaAtivaId", empresaId);
        } else {
            mostrarToast("Nenhuma empresa ativa selecionada. Você será redirecionado.", "#ef4444");
            const proximaPagina = empresas.length === 0 ? 'cadastro-empresa.html' : 'selecionar-empresa.html';
            setTimeout(() => { window.location.href = proximaPagina; }, 2000);
            return;
        }
    }

    const params = new URLSearchParams(window.location.search);
    clienteId = params.get('id');
    isEditing = !!clienteId;

    if (isEditing) {
        configurarModoEdicao();
        await carregarDadosCliente();
    }

    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
    if (btnExcluir) {
        btnExcluir.addEventListener('click', handleExcluirCliente);
    }
});
