// ======================================================================
// ARQUIVO: vitrine-pets-observacoes.js
// PRONTI PET - Observações importantes do pet no agendamento
// ======================================================================

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./vitrini-firebase.js";
import { getPetSelecionado } from "./vitrine-pets.js";

// ======================================================================
// Buscar pet atualizado no Firebase
// ======================================================================
export async function buscarPetAtualizado(empresaId, clienteId, petId) {
    if (!empresaId || !clienteId || !petId) return null;

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

    if (!petSnap.exists()) return null;

    return {
        id: petSnap.id,
        ...petSnap.data()
    };
}

// ======================================================================
// Pegar observação permanente do pet
// ======================================================================
export async function obterObservacaoPetSelecionado(empresaId, user) {
    if (!empresaId || !user) return "";

    const petSelecionado = getPetSelecionado();

    if (!petSelecionado || !petSelecionado.id) return "";

    const petAtualizado = await buscarPetAtualizado(
        empresaId,
        user.uid,
        petSelecionado.id
    );

    const observacao = String(
        petAtualizado?.observacoes ||
        petSelecionado?.observacoes ||
        ""
    ).trim();

    return observacao;
}

// ======================================================================
// Modal de alerta de observação do pet
// ======================================================================
function garantirModalObservacaoPet() {
    if (document.getElementById("modal-observacao-pet-pronti")) return;

    const modal = document.createElement("div");
    modal.id = "modal-observacao-pet-pronti";
    modal.style.display = "none";

    modal.innerHTML = `
        <div class="modal-observacao-pet-overlay">
            <div class="modal-observacao-pet-card">
                <div class="modal-observacao-pet-icon">⚠️</div>

                <h2>Atenção ao Pet</h2>

                <p class="modal-observacao-pet-texto">
                    Este pet possui uma observação importante cadastrada:
                </p>

                <div id="modal-observacao-pet-conteudo" class="modal-observacao-pet-conteudo"></div>

                <button type="button" id="btn-confirmar-observacao-pet">
                    Entendi, continuar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

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
        }

        .modal-observacao-pet-card {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border-radius: 22px;
            padding: 24px;
            color: #1e293b;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.35);
            text-align: center;
        }

        .modal-observacao-pet-icon {
            width: 58px;
            height: 58px;
            border-radius: 18px;
            margin: 0 auto 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fef3c7;
            font-size: 1.8rem;
        }

        .modal-observacao-pet-card h2 {
            margin: 0 0 10px;
            color: #92400e;
            font-size: 1.35rem;
            font-weight: 900;
        }

        .modal-observacao-pet-texto {
            color: #64748b;
            font-size: 0.95rem;
            margin-bottom: 14px;
        }

        .modal-observacao-pet-conteudo {
            background: #fffbeb;
            border: 1.5px solid #facc15;
            color: #78350f;
            padding: 14px;
            border-radius: 14px;
            font-size: 0.98rem;
            font-weight: 700;
            line-height: 1.45;
            white-space: pre-wrap;
            text-align: left;
            margin-bottom: 18px;
        }

        #btn-confirmar-observacao-pet {
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
    `;

    document.head.appendChild(style);
}

// ======================================================================
// Mostrar modal se existir observação
// ======================================================================
export function mostrarModalObservacaoPet(observacao) {
    return new Promise((resolve) => {
        const texto = String(observacao || "").trim();

        if (!texto) {
            resolve(true);
            return;
        }

        garantirModalObservacaoPet();

        const modal = document.getElementById("modal-observacao-pet-pronti");
        const conteudo = document.getElementById("modal-observacao-pet-conteudo");
        const btnConfirmar = document.getElementById("btn-confirmar-observacao-pet");

        conteudo.textContent = texto;
        modal.style.display = "block";

        btnConfirmar.onclick = () => {
            modal.style.display = "none";
            resolve(true);
        };
    });
}

// ======================================================================
// Função principal para usar antes de salvar agendamento
// ======================================================================
export async function validarObservacaoPetAntesDeAgendar(empresaId, user) {
    const observacaoPet = await obterObservacaoPetSelecionado(empresaId, user);

    if (observacaoPet) {
        await mostrarModalObservacaoPet(observacaoPet);
    }

    return {
        observacaoPet
    };
}
