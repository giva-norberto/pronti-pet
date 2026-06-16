```js
// ======================================================================
// ARQUIVO: vitrine-pets.js
// PRONTI PET - Lógica de Pet para AGENDAMENTO
// ======================================================================
//
// Este arquivo deve cuidar somente do fluxo do agendamento:
//
// - Garantir que o cliente exista
// - Buscar pets do cliente
// - Selecionar pet para o agendamento
// - Criar pet quando ainda não existir nenhum, usando o modal do arquivo novo
// - Retornar pet selecionado
// - Retornar foto do pet selecionado
// - Calcular preço e duração pelo porte
//
// NÃO colocar aqui:
// - Gestão visual dos pets
// - Cards "Meus Pets"
// - Editar pet
// - Trocar foto
// - Preview grande de foto
// - Trava de 30 dias
//
// Tudo isso fica em:
// vitrine-pets-gestao.js
// ======================================================================

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db } from "./vitrini-firebase.js";

import {
    abrirModalCadastroPet
} from "./vitrine-pets-gestao.js";

// ======================================================================
// Estado local do agendamento
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

function escapeHTML(valor) {
    const div = document.createElement("div");
    div.textContent = valor || "";
    return div.innerHTML;
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

function getClientePetsRef(empresaId, clienteId) {
    return collection(db, "empresarios", empresaId, "clientes", clienteId, "pets");
}

function getClienteRef(empresaId, clienteId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId);
}

function montarHtmlPreviewFoto(url) {
    if (!url) return "🐾";

    return `<img src="${escapeHTML(url)}" alt="Foto do pet">`;
}

// ======================================================================
// Garantir modal básico para seleção de pet
// ======================================================================

function garantirModalPetNoHtml() {
    let modal = document.getElementById("modal-pet-pronti");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-pet-pronti";
        modal.style.display = "none";
        document.body.appendChild(modal);
    }

    if (document.getElementById("style-modal-pet-agendamento")) return;

    const style = document.createElement("style");
    style.id = "style-modal-pet-agendamento";

    style.textContent = `
        #modal-pet-pronti {
            position: fixed;
            inset: 0;
            z-index: 99999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .modal-pet-overlay {
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.58);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            box-sizing: border-box;
        }

        .modal-pet-card {
            width: 100%;
            max-width: 500px;
            max-height: calc(100vh - 28px);
            overflow-y: auto;
            background: #ffffff;
            border-radius: 22px;
            padding: 22px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.32);
            box-sizing: border-box;
            color: #1e293b;
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
            overflow: hidden;
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

        .lista-pets-modal {
            display: grid;
            gap: 10px;
        }

        .pet-opcao-btn {
            width: 100%;
            border: 1.5px solid #e0e7ff;
            background: #f8fafc;
            border-radius: 16px;
            padding: 13px;
            box-sizing: border-box;
            font-family: inherit;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            gap: 12px;
        }

        .pet-opcao-btn:hover {
            background: #eef2ff;
            border-color: #4f46e5;
        }

        .pet-opcao-dados {
            display: flex;
            align-items: center;
            gap: 11px;
            min-width: 0;
        }

        .pet-opcao-foto {
            width: 54px;
            height: 54px;
            border-radius: 16px;
            background: #eef2ff;
            color: #6366f1;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
            font-size: 1.35rem;
        }

        .pet-opcao-foto img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pet-opcao-texto {
            display: grid;
            text-align: left;
            min-width: 0;
        }

        .pet-opcao-texto strong {
            color: #1e293b;
            font-size: 1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .pet-opcao-texto small {
            color: #64748b;
            font-weight: 700;
            font-size: 0.82rem;
            margin-top: 2px;
        }

        .pet-opcao-btn span {
            color: #4f46e5;
            font-weight: 900;
            font-size: 0.9rem;
            white-space: nowrap;
        }

        .modal-pet-actions {
            margin-top: 18px;
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
        }

        .btn-pet-secondary {
            border: none;
            border-radius: 12px;
            padding: 11px 14px;
            font-weight: 900;
            font-size: 0.92rem;
            cursor: pointer;
            font-family: inherit;
            background: #eef2ff;
            color: #4338ca;
        }

        @media (max-width: 520px) {
            .modal-pet-overlay {
                align-items: flex-end;
                padding: 10px;
            }

            .modal-pet-card {
                max-width: 100%;
                max-height: calc(100vh - 20px);
                border-radius: 22px 22px 16px 16px;
                padding: 18px;
            }

            .pet-opcao-btn {
                align-items: flex-start;
                flex-direction: column;
            }
        }
    `;

    document.head.appendChild(style);
}

function fecharModalPet() {
    const modal = document.getElementById("modal-pet-pronti");

    if (modal) {
        modal.style.display = "none";
        modal.innerHTML = "";
    }
}

// ======================================================================
// Buscar pets do cliente
// ======================================================================

export async function buscarPetsDoCliente(empresaId, clienteId) {
    if (!empresaId || !clienteId) return [];

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const snap = await getDocs(petsRef);

    petsCliente = snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }))
        .filter((pet) => pet.ativo !== false);

    return petsCliente;
}

// ======================================================================
// Garantir que cliente exista
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
                            <button type="button" class="pet-opcao-btn" data-pet-id="${escapeHTML(pet.id)}">
                                <div class="pet-opcao-dados">
                                    <div class="pet-opcao-foto">
                                        ${montarHtmlPreviewFoto(pet.fotoUrl)}
                                    </div>

                                    <div class="pet-opcao-texto">
                                        <strong>${escapeHTML(pet.nome || "Pet")}</strong>
                                        <small>
                                            ${
                                                pet.raca
                                                    ? `${escapeHTML(pet.raca)} • ${escapeHTML(nomePorte(pet.porte))}`
                                                    : escapeHTML(nomePorte(pet.porte))
                                            }
                                            ${pet.peso ? ` • ${escapeHTML(pet.peso)}` : ""}
                                        </small>
                                    </div>
                                </div>

                                <span>Selecionar</span>
                            </button>
                        `).join("")}
                    </div>

                    <div class="modal-pet-actions">
                        <button type="button" id="btn-cancelar-selecao-pet" class="btn-pet-secondary">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "block";

        document.getElementById("btn-cancelar-selecao-pet").onclick = () => {
            fecharModalPet();
            resolve(null);
        };

        modal.querySelectorAll(".pet-opcao-btn").forEach((btn) => {
            btn.onclick = () => {
                const petId = btn.dataset.petId;
                const pet = pets.find((p) => p.id === petId);

                petSelecionado = pet || null;

                fecharModalPet();
                resolve(petSelecionado);
            };
        });
    });
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

        if (petSelecionado) {
            await buscarPetsDoCliente(empresaId, user.uid);
        }

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

export function getFotoPetSelecionado() {
    return {
        petFotoUrl: petSelecionado?.fotoUrl || "",
        petFotoPath: petSelecionado?.fotoPath || ""
    };
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
        let item = servico.precos.find((p) => {
            return normalizarPorte(p.porte) === portePet;
        });

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
```
