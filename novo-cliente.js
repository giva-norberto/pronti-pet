// novo-cliente.js
// Cadastro manual do tutor + gestão de pets usando o mesmo módulo da vitrine.

// --- IMPORTS ---
import { db, auth } from "./firebase-config.js";

import {
    doc,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
    abrirModalCadastroPet,
    buscarPetsGestaoDoCliente,
    renderizarCardsPets
} from "./vitrine-pets-gestao.js";


// --- ELEMENTOS DO DOM ---
const form = document.getElementById("form-cliente");
const formTitulo = document.getElementById("form-titulo");
const formSubtitulo = document.getElementById("form-subtitulo");
const btnSalvar = document.getElementById("btn-salvar");
const btnExcluir = document.getElementById("btn-excluir");
const btnAdicionarPet = document.getElementById("btn-adicionar-pet");
const petSectionBlocked = document.getElementById("pet-section-blocked");
const petTools = document.getElementById("pet-tools");
const listaPetsCliente = document.getElementById("lista-pets-cliente");
const statusVinculoCliente = document.getElementById("status-vinculo-cliente");


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
            style: {
                background: cor,
                color: "white"
            }
        }).showToast();
    } else {
        alert(texto);
    }
}

function normalizarTelefone(valor) {
    return String(valor || "").replace(/\D/g, "");
}

function normalizarEmail(valor) {
    return String(valor || "").trim().toLowerCase();
}

function obterCamposTutor() {
    const nome = document.getElementById("nome-cliente")?.value.trim() || "";
    const telefone = document.getElementById("telefone-cliente")?.value.trim() || "";
    const email = document.getElementById("email-cliente")?.value.trim() || "";

    return {
        nome,
        telefone,
        email,
        telefoneNormalizado: normalizarTelefone(telefone),
        emailNormalizado: normalizarEmail(email)
    };
}

function validarCamposTutor(dados) {
    if (!dados.nome) {
        mostrarToast("O campo Nome Completo é obrigatório.", "#ef4444");
        return false;
    }

    if (!dados.telefoneNormalizado && !dados.emailNormalizado) {
        mostrarToast("Informe pelo menos um telefone ou e-mail.", "#ef4444");
        return false;
    }

    if (dados.telefoneNormalizado && dados.telefoneNormalizado.length < 10) {
        mostrarToast("Informe um telefone válido com DDD.", "#ef4444");
        return false;
    }

    return true;
}

async function buscaEmpresasDoUsuario(uid) {
    const q = query(
        collection(db, "empresarios"),
        where("donoId", "==", uid)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
    }));
}

async function verificarDuplicidadeCliente(telefoneNormalizado, emailNormalizado) {
    const clientesRef = collection(
        db,
        "empresarios",
        empresaId,
        "clientes"
    );

    const encontrados = new Map();

    if (telefoneNormalizado) {
        const qTelefone = query(
            clientesRef,
            where("telefoneNormalizado", "==", telefoneNormalizado)
        );

        const snapTelefone = await getDocs(qTelefone);

        snapTelefone.forEach(docSnap => {
            encontrados.set(docSnap.id, {
                id: docSnap.id,
                ...docSnap.data()
            });
        });
    }

    if (emailNormalizado) {
        const qEmail = query(
            clientesRef,
            where("emailNormalizado", "==", emailNormalizado)
        );

        const snapEmail = await getDocs(qEmail);

        snapEmail.forEach(docSnap => {
            encontrados.set(docSnap.id, {
                id: docSnap.id,
                ...docSnap.data()
            });
        });
    }

    return [...encontrados.values()].filter(cliente => cliente.id !== clienteId);
}

function configurarModoEdicao() {
    isEditing = true;

    if (formTitulo) {
        formTitulo.textContent = "Editar Cliente";
    }

    if (formSubtitulo) {
        formSubtitulo.textContent =
            "Atualize o tutor e gerencie os pets vinculados ao mesmo cadastro.";
    }

    if (btnSalvar) {
        btnSalvar.innerHTML =
            '<i class="fa-solid fa-floppy-disk"></i> Atualizar cliente';
    }

    if (btnExcluir) {
        btnExcluir.style.display = "inline-flex";
    }
}

function atualizarUrlComClienteId(id) {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    window.history.replaceState({}, "", url);
}

function atualizarStatusVinculo(cliente = {}) {
    if (!statusVinculoCliente) return;

    const uidVinculado =
        cliente.uid ||
        cliente.userUid ||
        cliente.clienteUid ||
        cliente.authUid ||
        "";

    if (uidVinculado) {
        statusVinculoCliente.textContent =
            "Conta online vinculada. O cliente poderá acessar seus pets pela vitrine.";
        return;
    }

    statusVinculoCliente.textContent =
        "Cadastro manual ainda sem conta online vinculada.";
}

function liberarGestaoPets() {
    if (!clienteId) return;

    if (petSectionBlocked) {
        petSectionBlocked.style.display = "none";
    }

    if (petTools) {
        petTools.classList.add("ativo");
    }
}

async function carregarPetsCliente() {
    if (!empresaId || !clienteId || !listaPetsCliente) return;

    liberarGestaoPets();

    listaPetsCliente.innerHTML =
        '<div class="loading-pets">Carregando pets...</div>';

    try {
        const pets = await buscarPetsGestaoDoCliente(
            empresaId,
            clienteId
        );

        renderizarCardsPets(
            listaPetsCliente,
            pets,
            empresaId,
            clienteId
        );
    } catch (error) {
        console.error("Erro ao carregar pets:", error);

        listaPetsCliente.innerHTML = `
            <div class="pet-gestao-vazio">
                <strong>Não foi possível carregar os pets.</strong>
                Verifique a conexão e tente novamente.
            </div>
        `;

        mostrarToast(
            "Não foi possível carregar os pets deste cliente.",
            "#ef4444"
        );
    }
}

async function carregarDadosCliente() {
    try {
        const clienteRef = doc(
            db,
            "empresarios",
            empresaId,
            "clientes",
            clienteId
        );

        const docSnap = await getDoc(clienteRef);

        if (!docSnap.exists()) {
            mostrarToast(
                "Cliente não encontrado. Você será redirecionado.",
                "#ef4444"
            );

            setTimeout(() => {
                window.location.href = "clientes.html";
            }, 2000);

            return;
        }

        const cliente = docSnap.data();

        document.getElementById("nome-cliente").value =
            cliente.nome || "";

        document.getElementById("telefone-cliente").value =
            cliente.telefone || "";

        document.getElementById("email-cliente").value =
            cliente.email || "";

        atualizarStatusVinculo(cliente);
        await carregarPetsCliente();
    } catch (error) {
        console.error("Erro ao carregar dados do cliente:", error);

        mostrarToast(
            "Ocorreu um erro ao buscar os dados do cliente.",
            "#ef4444"
        );
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const dados = obterCamposTutor();

    if (!validarCamposTutor(dados)) {
        return;
    }

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const duplicados = await verificarDuplicidadeCliente(
            dados.telefoneNormalizado,
            dados.emailNormalizado
        );

        if (duplicados.length > 0) {
            const existente = duplicados[0];

            mostrarToast(
                `Já existe um cliente com este telefone ou e-mail: ${existente.nome || "cliente cadastrado"}.`,
                "#ef4444"
            );

            return;
        }

        const dadosCliente = {
            nome: dados.nome,
            telefone: dados.telefone,
            email: dados.email,
            telefoneNormalizado: dados.telefoneNormalizado,
            emailNormalizado: dados.emailNormalizado,
            origemCadastro: "manual",
            atualizadoEm: serverTimestamp()
        };

        if (isEditing && clienteId) {
            const clienteRef = doc(
                db,
                "empresarios",
                empresaId,
                "clientes",
                clienteId
            );

            await updateDoc(clienteRef, dadosCliente);

            mostrarToast(
                "Cliente atualizado com sucesso!",
                "#22c55e"
            );
        } else {
            dadosCliente.criadoEm = serverTimestamp();
            dadosCliente.contaVinculada = false;

            const clientesCollectionRef = collection(
                db,
                "empresarios",
                empresaId,
                "clientes"
            );

            const novoClienteRef = await addDoc(
                clientesCollectionRef,
                dadosCliente
            );

            clienteId = novoClienteRef.id;
            configurarModoEdicao();
            atualizarUrlComClienteId(clienteId);
            atualizarStatusVinculo(dadosCliente);

            mostrarToast(
                "Cliente salvo. Agora você pode cadastrar os pets.",
                "#22c55e"
            );
        }

        await carregarPetsCliente();
    } catch (error) {
        console.error("Erro ao salvar cliente:", error);

        mostrarToast(
            "Ocorreu um erro ao salvar o cliente.",
            "#ef4444"
        );
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = isEditing
                ? '<i class="fa-solid fa-floppy-disk"></i> Atualizar cliente'
                : '<i class="fa-solid fa-floppy-disk"></i> Salvar cliente e continuar';
        }
    }
}

async function handleAdicionarPet() {
    if (!empresaId || !clienteId) {
        mostrarToast(
            "Salve o cliente antes de adicionar um pet.",
            "#ef4444"
        );

        return;
    }

    try {
        const novoPet = await abrirModalCadastroPet(
            empresaId,
            clienteId,
            null
        );

        if (novoPet) {
            mostrarToast(
                "Pet cadastrado com sucesso!",
                "#22c55e"
            );

            await carregarPetsCliente();
        }
    } catch (error) {
        console.error("Erro ao cadastrar pet:", error);

        mostrarToast(
            error.message || "Não foi possível cadastrar o pet.",
            "#ef4444"
        );
    }
}

async function handleExcluirCliente() {
    if (!clienteId) return;

    const confirmou = confirm(
        "Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
    );

    if (!confirmou) {
        return;
    }

    try {
        const clienteRef = doc(
            db,
            "empresarios",
            empresaId,
            "clientes",
            clienteId
        );

        await deleteDoc(clienteRef);

        mostrarToast(
            "Cliente excluído com sucesso!",
            "#22c55e"
        );

        setTimeout(() => {
            window.location.href = "clientes.html";
        }, 1500);
    } catch (error) {
        console.error("Erro ao excluir cliente:", error);

        mostrarToast(
            "Ocorreu um erro ao excluir o cliente.",
            "#ef4444"
        );
    }
}


// --- AUTENTICAÇÃO E INICIALIZAÇÃO ---
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    userUid = user.uid;
    empresaId = localStorage.getItem("empresaAtivaId");

    if (!empresaId) {
        try {
            const empresas = await buscaEmpresasDoUsuario(userUid);

            if (empresas.length === 1) {
                empresaId = empresas[0].id;
                localStorage.setItem("empresaAtivaId", empresaId);
            } else {
                mostrarToast(
                    "Nenhuma empresa ativa selecionada. Você será redirecionado.",
                    "#ef4444"
                );

                const proximaPagina =
                    empresas.length === 0
                        ? "cadastro-empresa.html"
                        : "selecionar-empresa.html";

                setTimeout(() => {
                    window.location.href = proximaPagina;
                }, 2000);

                return;
            }
        } catch (error) {
            console.error("Erro ao localizar empresa:", error);

            mostrarToast(
                "Não foi possível localizar a empresa ativa.",
                "#ef4444"
            );

            return;
        }
    }

    const params = new URLSearchParams(window.location.search);
    clienteId = params.get("id");
    isEditing = Boolean(clienteId);

    if (isEditing) {
        configurarModoEdicao();
        await carregarDadosCliente();
    }

    if (form) {
        form.addEventListener("submit", handleFormSubmit);
    }

    if (btnExcluir) {
        btnExcluir.addEventListener("click", handleExcluirCliente);
    }

    if (btnAdicionarPet) {
        btnAdicionarPet.addEventListener("click", handleAdicionarPet);
    }
});
