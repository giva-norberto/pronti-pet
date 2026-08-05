// ======================================================================
// ARQUIVO: vitrine-pets.js
// PRONTI PET - Lógica de Pet para AGENDAMENTO
// ======================================================================

import {
    buscarPetsDoCliente,
    garantirClientePet,
    normalizarPorte,
    nomePorte,
    escapeHTML
} from "./vitrine-pets-db.js";

import {
    abrirModalCadastroPet
} from "./vitrine-pets-gestao.js";

// ======================================================================
// Estado local do agendamento
// ======================================================================

let petsCliente = [];
let petSelecionado = null;

// ======================================================================
// Utilitário visual
// ======================================================================

function montarHtmlPreviewFoto(url) {
    if (!url) return "🐾";
    return `<img src="${escapeHTML(url)}" alt="Foto do pet">`;
}

// ======================================================================
// Modal básico para seleção do pet no agendamento
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
// Buscar pets para o fluxo de agendamento
// ======================================================================

export async function carregarPetsDoCliente(empresaId, userOuClienteId) {
    petsCliente = await buscarPetsDoCliente(empresaId, userOuClienteId);
    return petsCliente;
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

    const pets = await carregarPetsDoCliente(empresaId, user);

    if (pets.length === 0) {
        petSelecionado = await abrirModalCadastroPet(empresaId, user);

        if (petSelecionado) {
            await carregarPetsDoCliente(empresaId, user);
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
// Fluxo dinâmico: preparar, cadastrar e definir pet sem abrir seleção modal
// ======================================================================

/**
 * Prepara os pets do cliente para o assistente dinâmico de agendamento.
 * Mantém o mesmo caminho de leitura utilizado por carregarPetsDoCliente().
 */
export async function prepararPetsParaAgendamento(
    empresaId,
    userOuClienteId
) {
    if (!empresaId || !userOuClienteId) {
        petsCliente = [];
        petSelecionado = null;
        return [];
    }

    await garantirClientePet(
        empresaId,
        userOuClienteId
    );

    return carregarPetsDoCliente(
        empresaId,
        userOuClienteId
    );
}

/**
 * Abre o cadastro existente e devolve o pet criado para o novo fluxo.
 * O cadastro e os caminhos do Firebase continuam sob responsabilidade
 * de vitrine-pets-gestao.js.
 */
export async function cadastrarPetParaAgendamento(
    empresaId,
    userOuClienteId
) {
    if (!empresaId || !userOuClienteId) {
        return null;
    }

    await garantirClientePet(
        empresaId,
        userOuClienteId
    );

    const novoPet = await abrirModalCadastroPet(
        empresaId,
        userOuClienteId
    );

    if (!novoPet) {
        return null;
    }

    petSelecionado = novoPet;

    await carregarPetsDoCliente(
        empresaId,
        userOuClienteId
    );

    return petSelecionado;
}

/**
 * Define explicitamente o pet selecionado pelo assistente em cards.
 */
export function definirPetSelecionado(pet) {
    petSelecionado = pet || null;
    return petSelecionado;
}

/**
 * Limpa apenas o estado local de seleção do agendamento.
 */
export function limparPetSelecionado() {
    petSelecionado = null;
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
