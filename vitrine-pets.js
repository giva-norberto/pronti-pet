// ======================================================================
// ARQUIVO: vitrine-pets.js
// PRONTI PET - Cadastro e seleção de pet do cliente na vitrine
// ======================================================================

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db } from "./vitrini-firebase.js";

// ======================================================================
// Estado local dos pets
// ======================================================================
let petsCliente = [];
let petSelecionado = null;

// ======================================================================
// Utilitários
// ======================================================================
function normalizarPorte(porte) {
    return String(porte || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function getClientePetsRef(empresaId, clienteId) {
    return collection(db, "empresarios", empresaId, "clientes", clienteId, "pets");
}

function getClienteRef(empresaId, clienteId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId);
}

// ======================================================================
// Buscar pets do cliente
// ======================================================================
export async function buscarPetsDoCliente(empresaId, clienteId) {
    if (!empresaId || !clienteId) return [];

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const snap = await getDocs(petsRef);

    petsCliente = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
    }));

    return petsCliente;
}

// ======================================================================
// Salvar pet
// ======================================================================
export async function salvarPetCliente(empresaId, clienteId, dadosPet) {
    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");

    const nome = String(dadosPet.nome || "").trim();
    const porte = normalizarPorte(dadosPet.porte);

    if (!nome) {
        throw new Error("Informe o nome do pet.");
    }

    if (!["pequeno", "medio", "grande", "gigante"].includes(porte)) {
        throw new Error("Selecione um porte válido para o pet.");
    }

    const pet = {
        nome,
        porte,
        raca: String(dadosPet.raca || "").trim(),
        peso: String(dadosPet.peso || "").trim(),
        observacoes: String(dadosPet.observacoes || "").trim(),
        ativo: true,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    };

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const novoPetRef = await addDoc(petsRef, pet);

    petSelecionado = {
        id: novoPetRef.id,
        ...pet,
        criadoEm: new Date(),
        atualizadoEm: new Date()
    };

    petsCliente.push(petSelecionado);

    return petSelecionado;
}

// ======================================================================
// Garante que cliente exista
// ======================================================================
export async function garantirClientePet(empresaId, user) {
    if (!empresaId || !user) return;

    const clienteRef = getClienteRef(empresaId, user.uid);
    const clienteSnap = await getDoc(clienteRef);

    const dadosAtuais = clienteSnap.exists() ? clienteSnap.data() : {};

    await setDoc(clienteRef, {
        nome: dadosAtuais.nome || user.displayName || "Cliente",
        email: dadosAtuais.email || user.email || "",
        atualizadoEm: serverTimestamp(),
        dataCadastro: dadosAtuais.dataCadastro || serverTimestamp()
    }, { merge: true });
}

// ======================================================================
// Modal HTML
// ======================================================================
function garantirModalPetNoHtml() {
    if (document.getElementById("modal-pet-pronti")) return;

    const modal = document.createElement("div");
    modal.id = "modal-pet-pronti";
    modal.style.display = "none";

    modal.innerHTML = `
        <div class="modal-pet-overlay">
            <div class="modal-pet-card">
                <div class="modal-pet-header">
                    <div class="modal-pet-icon">🐾</div>
                    <div>
                        <h2>Cadastre seu Pet</h2>
                        <p>Para mostrar o preço correto, precisamos saber o porte do seu pet.</p>
                    </div>
                </div>

                <div class="modal-pet-form">
                    <label>Nome do Pet *</label>
                    <input type="text" id="pet-nome" placeholder="Ex: Thor">

                    <label>Porte *</label>
                    <select id="pet-porte">
                        <option value="">Selecione</option>
                        <option value="pequeno">Pequeno</option>
                        <option value="medio">Médio</option>
                        <option value="grande">Grande</option>
                        <option value="gigante">Gigante</option>
                    </select>

                    <label>Raça</label>
                    <input type="text" id="pet-raca" placeholder="Ex: Shih-tzu">

                    <label>Peso</label>
                    <input type="text" id="pet-peso" placeholder="Ex: 6 kg">

                    <label>Observações</label>
                    <textarea id="pet-observacoes" rows="3" placeholder="Ex: Tem alergia, é bravo, precisa de cuidado especial..."></textarea>

                    <div id="pet-modal-erro" class="modal-pet-erro"></div>
                </div>

                <div class="modal-pet-actions">
                    <button type="button" id="btn-salvar-pet" class="btn-pet-primary">
                        Salvar Pet
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const style = document.createElement("style");
    style.id = "style-modal-pet-pronti";
    style.textContent = `
        #modal-pet-pronti {
            position: fixed;
            inset: 0;
            z-index: 99999;
        }

        .modal-pet-overlay {
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.55);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
        }

        .modal-pet-card {
            width: 100%;
            max-width: 430px;
            background: #ffffff;
            border-radius: 22px;
            padding: 22px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.32);
        }

        .modal-pet-header {
            display: flex;
            gap: 14px;
            align-items: flex-start;
            margin-bottom: 18px;
        }

        .modal-pet-icon {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            background: linear-gradient(135deg, #4f46e5, #8b5cf6);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            flex-shrink: 0;
        }

        .modal-pet-header h2 {
            margin: 0;
            color: #1e293b;
            font-size: 1.35rem;
            font-weight: 900;
        }

        .modal-pet-header p {
            margin: 5px 0 0;
            color: #64748b;
            font-size: 0.92rem;
            line-height: 1.35;
        }

        .modal-pet-form label {
            display: block;
            margin: 10px 0 5px;
            color: #334155;
            font-size: 0.88rem;
            font-weight: 800;
        }

        .modal-pet-form input,
        .modal-pet-form select,
        .modal-pet-form textarea {
            width: 100%;
            border: 1.5px solid #dbe3ef;
            background: #f8fafc;
            border-radius: 12px;
            padding: 11px 12px;
            font-size: 0.95rem;
            font-family: inherit;
            outline: none;
            box-sizing: border-box;
        }

        .modal-pet-form input:focus,
        .modal-pet-form select:focus,
        .modal-pet-form textarea:focus {
            border-color: #4f46e5;
            background: #fff;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
        }

        .modal-pet-erro {
            display: none;
            margin-top: 12px;
            color: #dc2626;
            font-size: 0.9rem;
            font-weight: 700;
        }

        .modal-pet-actions {
            margin-top: 18px;
        }

        .btn-pet-primary {
            width: 100%;
            border: none;
            border-radius: 13px;
            padding: 13px 16px;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: #fff;
            font-weight: 900;
            font-size: 1rem;
            cursor: pointer;
        }

        .btn-pet-primary:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }
    `;

    document.head.appendChild(style);
}

// ======================================================================
// Abrir modal de cadastro de pet
// ======================================================================
export function abrirModalCadastroPet(empresaId, user) {
    return new Promise((resolve) => {
        garantirModalPetNoHtml();

        const modal = document.getElementById("modal-pet-pronti");
        const nomeInput = document.getElementById("pet-nome");
        const porteInput = document.getElementById("pet-porte");
        const racaInput = document.getElementById("pet-raca");
        const pesoInput = document.getElementById("pet-peso");
        const obsInput = document.getElementById("pet-observacoes");
        const erroEl = document.getElementById("pet-modal-erro");
        const btnSalvar = document.getElementById("btn-salvar-pet");

        nomeInput.value = "";
        porteInput.value = "";
        racaInput.value = "";
        pesoInput.value = "";
        obsInput.value = "";
        erroEl.style.display = "none";
        erroEl.textContent = "";

        modal.style.display = "block";

        setTimeout(() => nomeInput.focus(), 100);

        btnSalvar.onclick = async () => {
            try {
                btnSalvar.disabled = true;
                btnSalvar.textContent = "Salvando...";

                const pet = await salvarPetCliente(empresaId, user.uid, {
                    nome: nomeInput.value,
                    porte: porteInput.value,
                    raca: racaInput.value,
                    peso: pesoInput.value,
                    observacoes: obsInput.value
                });

                modal.style.display = "none";
                resolve(pet);

            } catch (error) {
                erroEl.textContent = error.message || "Erro ao salvar pet.";
                erroEl.style.display = "block";
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.textContent = "Salvar Pet";
            }
        };
    });
}

// ======================================================================
// Selecionar pet quando existe mais de um
// ======================================================================
export function abrirModalSelecionarPet(pets = []) {
    return new Promise((resolve) => {
        garantirModalPetNoHtml();

        const modal = document.getElementById("modal-pet-pronti");

        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>Escolha o Pet</h2>
                            <p>Selecione qual pet será atendido neste agendamento.</p>
                        </div>
                    </div>

                    <div class="lista-pets-modal">
                        ${pets.map((pet) => `
                            <button type="button" class="pet-opcao-btn" data-pet-id="${pet.id}">
                                <strong>${pet.nome || "Pet"}</strong>
                                <span>${nomePorte(pet.porte)}</span>
                            </button>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;

        const styleExtra = document.createElement("style");
        styleExtra.textContent = `
            .lista-pets-modal {
                display: grid;
                gap: 10px;
            }

            .pet-opcao-btn {
                width: 100%;
                border: 1.5px solid #e0e7ff;
                background: #f8fafc;
                border-radius: 14px;
                padding: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                font-family: inherit;
            }

            .pet-opcao-btn strong {
                color: #1e293b;
                font-size: 1rem;
            }

            .pet-opcao-btn span {
                color: #4f46e5;
                font-weight: 900;
                font-size: 0.9rem;
            }

            .pet-opcao-btn:hover {
                background: #eef2ff;
                border-color: #4f46e5;
            }
        `;
        document.head.appendChild(styleExtra);

        modal.style.display = "block";

        modal.querySelectorAll(".pet-opcao-btn").forEach((btn) => {
            btn.onclick = () => {
                const petId = btn.dataset.petId;
                const pet = pets.find((p) => p.id === petId);

                petSelecionado = pet || null;

                modal.style.display = "none";
                resolve(petSelecionado);
            };
        });
    });
}

function nomePorte(porte) {
    const mapa = {
        pequeno: "Pequeno",
        medio: "Médio",
        grande: "Grande",
        gigante: "Gigante"
    };

    return mapa[normalizarPorte(porte)] || "Porte não informado";
}

// ======================================================================
// Fluxo principal: garantir pet antes do agendamento
// ======================================================================
export async function garantirPetParaAgendamento(empresaId, user) {
    if (!empresaId || !user) return null;

    await garantirClientePet(empresaId, user);

    const pets = await buscarPetsDoCliente(empresaId, user.uid);

    if (pets.length === 0) {
        petSelecionado = await abrirModalCadastroPet(empresaId, user);
        return petSelecionado;
    }

    if (pets.length === 1) {
        petSelecionado = pets[0];
        return petSelecionado;
    }

    petSelecionado = await abrirModalSelecionarPet(pets);
    return petSelecionado;
}

// ======================================================================
// Getters
// ======================================================================
export function getPetSelecionado() {
    return petSelecionado;
}

export function getPetsCliente() {
    return petsCliente;
}

// ======================================================================
// Preço e duração do serviço pelo porte do pet
// ======================================================================
export function obterPrecoDuracaoPorPet(servico, pet) {
    if (!servico) {
        return {
            preco: 0,
            duracao: 0,
            porte: ""
        };
    }

    const portePet = normalizarPorte(pet?.porte);

    if (Array.isArray(servico.precos) && servico.precos.length > 0) {
        let item = servico.precos.find((p) => normalizarPorte(p.porte) === portePet);

        if (!item) {
            item = servico.precos
                .map((p) => ({
                    ...p,
                    preco: Number(p.preco || 0),
                    duracao: Number(p.duracao || 0)
                }))
                .filter((p) => p.preco > 0 && p.duracao > 0)
                .sort((a, b) => a.preco - b.preco)[0];
        }

        if (item) {
            return {
                preco: Number(item.preco || 0),
                duracao: Number(item.duracao || 0),
                porte: normalizarPorte(item.porte)
            };
        }
    }

    return {
        preco: Number(servico.preco || 0),
        duracao: Number(servico.duracao || 0),
        porte: portePet
    };
}
