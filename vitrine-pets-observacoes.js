// ======================================================================
// ARQUIVO: vitrine-pets-observacoes.js
// PRONTI PET - Observação do atendimento na vitrine
// ======================================================================

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db } from "./vitrini-firebase.js";
import { getPetSelecionado } from "./vitrine-pets.js";

// ======================================================================
// Resolver o ID verdadeiro do cliente
//
// Compatibilidade:
// - Fluxo atual: recebe o objeto user do Firebase Auth
// - Novo fluxo: poderá receber diretamente o clienteId do Firestore
// ======================================================================
function resolverClienteId(userOuClienteId) {
    if (!userOuClienteId) return "";

    if (typeof userOuClienteId === "string") {
        return userOuClienteId.trim();
    }

    if (typeof userOuClienteId === "object") {
        return String(
            userOuClienteId.clienteId ||
            userOuClienteId.id ||
            userOuClienteId.uid ||
            ""
        ).trim();
    }

    return "";
}

// ======================================================================
// Buscar pet atualizado no Firebase
// ======================================================================
export async function buscarPetAtualizado(
    empresaId,
    clienteId,
    petId
) {
    if (!empresaId || !clienteId || !petId) {
        return null;
    }

    const petRef = doc(
        db,
        "empresarios",
        empresaId,
        "clientes",
        clienteId,
        "pets",
        petId
    );

    const petSnap = await getDoc(petRef);

    if (!petSnap.exists()) {
        return null;
    }

    return {
        id: petSnap.id,
        ...petSnap.data()
    };
}

// ======================================================================
// Pegar observação permanente do pet
//
// Pode receber:
// - objeto do Firebase Auth;
// - clienteId verdadeiro como string.
// ======================================================================
export async function obterObservacaoPetSelecionado(
    empresaId,
    userOuClienteId
) {
    const clienteId = resolverClienteId(userOuClienteId);

    if (!empresaId || !clienteId) {
        return "";
    }

    const petSelecionado = getPetSelecionado();

    if (!petSelecionado || !petSelecionado.id) {
        return "";
    }

    const petAtualizado = await buscarPetAtualizado(
        empresaId,
        clienteId,
        petSelecionado.id
    );

    return String(
        petAtualizado?.observacoes ||
        petSelecionado?.observacoes ||
        ""
    ).trim();
}

// ======================================================================
// Modal: perguntar observação do atendimento
// ======================================================================
function garantirModalObservacaoAtendimento() {
    if (
        document.getElementById(
            "modal-observacao-pet-pronti"
        )
    ) {
        return;
    }

    const modal = document.createElement("div");

    modal.id = "modal-observacao-pet-pronti";
    modal.style.display = "none";

    modal.innerHTML = `
        <div class="modal-observacao-pet-overlay">
            <div class="modal-observacao-pet-card">

                <div class="modal-observacao-pet-icon">
                    🐾
                </div>

                <h2>
                    Algum detalhe importante?
                </h2>

                <p class="modal-observacao-pet-texto">
                    Deseja deixar alguma observação para este atendimento?
                </p>

                <textarea
                    id="modal-observacao-atendimento-input"
                    class="modal-observacao-pet-textarea"
                    rows="4"
                    maxlength="500"
                    placeholder="Ex: Fazer tosa higiênica, limpar em volta dos olhos, não cortar muito curto..."
                ></textarea>

                <div class="modal-observacao-pet-ajuda">
                    Essa informação será enviada para o pet shop junto
                    com o agendamento.
                </div>

                <div class="modal-observacao-pet-botoes">

                    <button
                        type="button"
                        id="btn-continuar-sem-observacao-pet"
                    >
                        Continuar sem observação
                    </button>

                    <button
                        type="button"
                        id="btn-confirmar-observacao-pet"
                    >
                        Salvar e continuar
                    </button>

                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    if (
        document.getElementById(
            "style-modal-observacao-pet-pronti"
        )
    ) {
        return;
    }

    const style = document.createElement("style");

    style.id = "style-modal-observacao-pet-pronti";

    style.textContent = `
        #modal-observacao-pet-pronti {
            position: fixed;
            inset: 0;
            z-index: 999999;
        }

        .modal-observacao-pet-overlay {
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.62);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            box-sizing: border-box;
        }

        .modal-observacao-pet-card {
            width: 100%;
            max-width: 430px;
            background: #ffffff;
            border-radius: 22px;
            padding: 24px;
            color: #1e293b;
            box-shadow:
                0 18px 48px rgba(15, 23, 42, 0.35);
            text-align: center;
            box-sizing: border-box;
        }

        .modal-observacao-pet-icon {
            width: 58px;
            height: 58px;
            border-radius: 18px;
            margin: 0 auto 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #eef2ff;
            font-size: 1.8rem;
        }

        .modal-observacao-pet-card h2 {
            margin: 0 0 10px;
            color: #4f46e5;
            font-size: 1.35rem;
            font-weight: 900;
        }

        .modal-observacao-pet-texto {
            color: #64748b;
            font-size: 0.95rem;
            margin-bottom: 14px;
            line-height: 1.4;
        }

        .modal-observacao-pet-textarea {
            width: 100%;
            box-sizing: border-box;
            resize: vertical;
            min-height: 105px;
            border: 1.5px solid #dbe3ef;
            background: #f8fafc;
            border-radius: 14px;
            padding: 13px;
            font-size: 0.95rem;
            font-family: inherit;
            color: #1e293b;
            outline: none;
            line-height: 1.45;
            margin-bottom: 10px;
        }

        .modal-observacao-pet-textarea:focus {
            border-color: #4f46e5;
            background: #ffffff;
            box-shadow:
                0 0 0 3px rgba(79, 70, 229, 0.12);
        }

        .modal-observacao-pet-ajuda {
            font-size: 0.82rem;
            color: #64748b;
            margin-bottom: 16px;
        }

        .modal-observacao-pet-botoes {
            display: grid;
            gap: 10px;
        }

        #btn-continuar-sem-observacao-pet {
            width: 100%;
            border: none;
            border-radius: 13px;
            padding: 12px 16px;
            background: #eef2ff;
            color: #4f46e5;
            font-weight: 900;
            font-size: 0.95rem;
            cursor: pointer;
        }

        #btn-confirmar-observacao-pet {
            width: 100%;
            border: none;
            border-radius: 13px;
            padding: 13px 16px;
            background:
                linear-gradient(
                    135deg,
                    #6366f1,
                    #4f46e5
                );
            color: #ffffff;
            font-weight: 900;
            font-size: 1rem;
            cursor: pointer;
        }

        #btn-continuar-sem-observacao-pet:disabled,
        #btn-confirmar-observacao-pet:disabled {
            cursor: not-allowed;
            opacity: 0.65;
        }

        @media (max-width: 520px) {
            .modal-observacao-pet-overlay {
                align-items: flex-end;
                padding: 10px;
            }

            .modal-observacao-pet-card {
                max-width: 100%;
                max-height: calc(100vh - 20px);
                overflow-y: auto;
                border-radius: 22px 22px 16px 16px;
                padding: 20px 18px;
            }

            .modal-observacao-pet-textarea {
                font-size: 16px;
            }
        }
    `;

    document.head.appendChild(style);
}

// ======================================================================
// Mostrar modal e retornar observação digitada
// ======================================================================
export function perguntarObservacaoAtendimento() {
    return new Promise((resolve) => {
        garantirModalObservacaoAtendimento();

        const modal = document.getElementById(
            "modal-observacao-pet-pronti"
        );

        const input = document.getElementById(
            "modal-observacao-atendimento-input"
        );

        const btnConfirmar = document.getElementById(
            "btn-confirmar-observacao-pet"
        );

        const btnSemObservacao = document.getElementById(
            "btn-continuar-sem-observacao-pet"
        );

        if (
            !modal ||
            !input ||
            !btnConfirmar ||
            !btnSemObservacao
        ) {
            resolve("");
            return;
        }

        input.value = "";
        modal.style.display = "block";

        setTimeout(() => {
            input.focus();
        }, 100);

        let finalizado = false;

        function fecharModal(valor) {
            if (finalizado) return;

            finalizado = true;
            modal.style.display = "none";

            btnConfirmar.onclick = null;
            btnSemObservacao.onclick = null;

            resolve(valor);
        }

        btnConfirmar.onclick = () => {
            const observacaoAgendamento = String(
                input.value || ""
            ).trim();

            fecharModal(observacaoAgendamento);
        };

        btnSemObservacao.onclick = () => {
            input.value = "";
            fecharModal("");
        };
    });
}

// ======================================================================
// Função principal para usar antes de salvar agendamento
//
// Compatibilidade:
// - Atualmente recebe o objeto currentUser;
// - Futuramente poderá receber state.clienteId.
// ======================================================================
export async function validarObservacaoPetAntesDeAgendar(
    empresaId,
    userOuClienteId
) {
    let observacaoPet = "";
    let observacaoAgendamento = "";

    try {
        observacaoPet =
            await obterObservacaoPetSelecionado(
                empresaId,
                userOuClienteId
            );
    } catch (error) {
        console.warn(
            "⚠️ Não foi possível buscar observação do pet:",
            error
        );

        observacaoPet = "";
    }

    try {
        observacaoAgendamento =
            await perguntarObservacaoAtendimento();
    } catch (error) {
        console.warn(
            "⚠️ Não foi possível perguntar observação do atendimento:",
            error
        );

        observacaoAgendamento = "";
    }

    return {
        observacaoPet: String(
            observacaoPet || ""
        ).trim(),

        observacaoAgendamento: String(
            observacaoAgendamento || ""
        ).trim()
    };
}
