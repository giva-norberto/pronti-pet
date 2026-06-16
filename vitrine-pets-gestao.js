```js
// vitrine-pets-gestao.js
// Gestão isolada dos Pets na vitrine:
// - Listagem dos pets
// - Cadastro de pet
// - Edição de pet
// - Troca de foto com preview
// - Trava de 30 dias para nova alteração da foto
// - Cards no padrão visual da Agenda
//
// IMPORTANTE:
// Este arquivo NÃO deve controlar seleção de pet para agendamento.
// A lógica de agendamento deve continuar no vitrine-pets.js.

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

import { db } from "./vitrini-firebase.js";

let petsGestaoCliente = [];

// -----------------------------
// Utilitários
// -----------------------------
function escapeHTML(valor) {
    const div = document.createElement("div");
    div.textContent = valor || "";
    return div.innerHTML;
}

function normalizarPorte(porte) {
    return String(porte || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
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

function getClienteId(userOuClienteId) {
    if (!userOuClienteId) return "";
    if (typeof userOuClienteId === "string") return userOuClienteId;
    return userOuClienteId.uid || userOuClienteId.id || "";
}

function getClientePetsRef(empresaId, clienteId) {
    return collection(db, "empresarios", empresaId, "clientes", clienteId, "pets");
}

function getPetRef(empresaId, clienteId, petId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId, "pets", petId);
}

function getFotoPetPath(empresaId, clienteId, petId) {
    return `empresarios/${empresaId}/clientes/${clienteId}/pets/${petId}/fotoPet.jpg`;
}

function getDataFotoAlteradaEm(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    if (valor instanceof Date) return valor;

    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
}

function getDataLiberacaoFoto(pet) {
    const data = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);
    if (!data) return null;

    return new Date(data.getTime() + 30 * 24 * 60 * 60 * 1000);
}

function podeAlterarFotoPet(pet) {
    if (!pet?.fotoUrl && !pet?.fotoAlteradaEm) return true;

    const data = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);
    if (!data) return true;

    const agora = new Date();
    const diffDias = Math.floor((agora.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));

    return diffDias >= 30;
}

function validarArquivoFotoPet(arquivo) {
    if (!arquivo) throw new Error("Escolha uma foto para continuar.");

    const tiposPermitidos = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const tamanhoMaximo = 5 * 1024 * 1024;

    if (!tiposPermitidos.includes(arquivo.type)) {
        throw new Error("A foto precisa ser JPG, PNG ou WEBP.");
    }

    if (arquivo.size > tamanhoMaximo) {
        throw new Error("A foto precisa ter no máximo 5 MB.");
    }
}

function montarHtmlFotoPet(url) {
    if (!url) {
        return `<div class="pet-foto-placeholder">🐾</div>`;
    }

    return `<img src="${escapeHTML(url)}" alt="Foto do pet" class="pet-foto-img">`;
}

function mostrarErroPet(texto) {
    const erroEl = document.getElementById("pet-modal-erro");
    if (!erroEl) return;

    erroEl.textContent = texto || "Ocorreu um erro.";
    erroEl.style.display = "block";
}

// -----------------------------
// Estilos e Modal
// -----------------------------
function garantirModalPetNoHtml() {
    let modal = document.getElementById("modal-pet-pronti");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-pet-pronti";
        modal.style.display = "none";
        document.body.appendChild(modal);
    }

    if (document.getElementById("style-modal-pet-pronti")) return;

    const style = document.createElement("style");
    style.id = "style-modal-pet-pronti";
    style.textContent = `
        #modal-pet-pronti {
            position: fixed;
            inset: 0;
            z-index: 99999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .modal-pet-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.64);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
        }

        .modal-pet-card {
            width: 100%;
            max-width: 520px;
            max-height: 92vh;
            overflow-y: auto;
            background: #ffffff;
            border-radius: 22px;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
            padding: 22px;
        }

        .modal-pet-header {
            display: flex;
            gap: 14px;
            align-items: center;
            margin-bottom: 18px;
        }

        .modal-pet-icon {
            width: 52px;
            height: 52px;
            border-radius: 18px;
            background: #6d28d9;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.6rem;
            flex: 0 0 auto;
        }

        .modal-pet-header h2 {
            margin: 0;
            font-size: 1.35rem;
            color: #111827;
        }

        .modal-pet-header p {
            margin: 4px 0 0;
            color: #64748b;
            font-size: 0.95rem;
            line-height: 1.35;
        }

        .modal-pet-form {
            display: grid;
            gap: 10px;
        }

        .modal-pet-form label {
            font-weight: 800;
            color: #334155;
            font-size: 0.9rem;
            margin-top: 4px;
        }

        .modal-pet-form input,
        .modal-pet-form select,
        .modal-pet-form textarea {
            width: 100%;
            border: 1px solid #dbe3f0;
            border-radius: 14px;
            padding: 12px 13px;
            font-size: 0.95rem;
            outline: none;
            background: #ffffff;
            color: #111827;
            box-sizing: border-box;
        }

        .modal-pet-form textarea {
            resize: vertical;
        }

        .modal-pet-form input:focus,
        .modal-pet-form select:focus,
        .modal-pet-form textarea:focus {
            border-color: #7c3aed;
            box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
        }

        .modal-pet-erro {
            display: none;
            padding: 11px 12px;
            border-radius: 14px;
            background: #fef2f2;
            color: #b91c1c;
            font-weight: 700;
            font-size: 0.9rem;
            margin-top: 8px;
        }

        .modal-pet-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .modal-pet-actions.um-botao {
            justify-content: center;
        }

        .btn-pet-primary,
        .btn-pet-secondary {
            border: 0;
            border-radius: 14px;
            padding: 12px 16px;
            font-weight: 900;
            cursor: pointer;
            font-size: 0.95rem;
        }

        .btn-pet-primary {
            background: #6d28d9;
            color: #ffffff;
        }

        .btn-pet-primary:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }

        .btn-pet-secondary {
            background: #eef2ff;
            color: #3730a3;
        }

        .pet-preview-grande {
            width: 100%;
            min-height: 260px;
            border-radius: 18px;
            overflow: hidden;
            background: #eef2ff;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 12px;
            border: 1px solid #dbe3f0;
        }

        .pet-preview-grande img {
            width: 100%;
            height: 100%;
            max-height: 360px;
            object-fit: cover;
            display: block;
        }

        .pet-preview-placeholder {
            font-size: 4rem;
        }

        .pet-foto-aviso {
            margin-top: 12px;
            background: #fff7ed;
            border: 1px solid #fed7aa;
            color: #9a3412;
            padding: 12px;
            border-radius: 14px;
            font-weight: 800;
            line-height: 1.4;
            font-size: 0.92rem;
        }

        .pet-card-agenda {
            border: 1px solid #e5e7eb;
            border-radius: 18px;
            background: #ffffff;
            overflow: hidden;
            box-shadow: 0 8px 26px rgba(15, 23, 42, 0.08);
            margin-bottom: 14px;
        }

        .pet-card-topo {
            background: #6d28d9;
            color: #ffffff;
            padding: 12px 14px;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
        }

        .pet-card-topo strong {
            font-size: 0.95rem;
            letter-spacing: 0.02em;
        }

        .pet-card-corpo {
            padding: 14px;
            display: flex;
            gap: 14px;
            align-items: center;
        }

        .pet-foto-box {
            width: 86px;
            height: 86px;
            border-radius: 18px;
            background: #eef2ff;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
        }

        .pet-foto-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .pet-foto-placeholder {
            font-size: 2.3rem;
        }

        .pet-card-info {
            flex: 1;
            min-width: 0;
        }

        .pet-card-info h3 {
            margin: 0;
            color: #111827;
            font-size: 1.16rem;
            font-weight: 950;
        }

        .pet-card-info p {
            margin: 5px 0 0;
            color: #64748b;
            font-weight: 700;
            font-size: 0.92rem;
        }

        .pet-card-bloco {
            border-top: 1px solid #eef2f7;
            padding: 12px 14px;
        }

        .pet-card-bloco-titulo {
            font-weight: 950;
            color: #334155;
            margin-bottom: 6px;
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .pet-card-bloco-texto {
            color: #475569;
            font-weight: 700;
            line-height: 1.4;
            font-size: 0.92rem;
        }

        .pet-card-acoes {
            border-top: 1px solid #eef2f7;
            padding: 12px 14px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .btn-edit-pet,
        .btn-edit-foto {
            border: 0;
            border-radius: 12px;
            padding: 10px 12px;
            font-weight: 900;
            cursor: pointer;
            background: #f1f5f9;
            color: #334155;
        }

        .btn-edit-foto {
            background: #eef2ff;
            color: #3730a3;
        }

        .pet-gestao-vazio {
            padding: 18px;
            border: 1px dashed #cbd5e1;
            border-radius: 18px;
            background: #f8fafc;
            color: #475569;
            line-height: 1.45;
        }

        .pet-gestao-vazio strong {
            display: block;
            color: #111827;
            margin-bottom: 4px;
        }

        @media (max-width: 520px) {
            .modal-pet-card {
                padding: 18px;
                border-radius: 18px;
            }

            .pet-card-corpo {
                align-items: flex-start;
            }

            .pet-card-acoes {
                flex-direction: column;
            }

            .btn-edit-pet,
            .btn-edit-foto {
                width: 100%;
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

// -----------------------------
// Firestore / Storage
// -----------------------------
export async function buscarPetsGestaoDoCliente(empresaId, userOuClienteId) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId) return [];

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const snap = await getDocs(petsRef);

    petsGestaoCliente = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.ativo !== false);

    return petsGestaoCliente;
}

async function enviarFotoPetStorage(empresaId, clienteId, petId, arquivoFoto) {
    validarArquivoFotoPet(arquivoFoto);

    const storage = getStorage();
    const fotoPath = getFotoPetPath(empresaId, clienteId, petId);
    const ref = storageRef(storage, fotoPath);

    await uploadBytes(ref, arquivoFoto, {
        contentType: arquivoFoto.type || "image/jpeg"
    });

    const fotoUrl = await getDownloadURL(ref);

    return {
        fotoUrl,
        fotoPath
    };
}

export async function criarPetClienteGestao(empresaId, userOuClienteId, dadosPet, arquivoFoto = null) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId) {
        throw new Error("Empresa ou cliente não informado.");
    }

    const nome = String(dadosPet.nome || "").trim();
    const porte = normalizarPorte(dadosPet.porte);

    if (!nome) throw new Error("Informe o nome do pet.");
    if (!porte) throw new Error("Selecione o porte do pet.");

    const petBase = {
        nome,
        porte,
        raca: String(dadosPet.raca || "").trim(),
        peso: String(dadosPet.peso || "").trim(),
        observacoes: String(dadosPet.observacoes || "").trim(),
        fotoUrl: "",
        fotoPath: "",
        fotoAlteradaEm: null,
        ativo: true,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    };

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const novoPetRef = await addDoc(petsRef, petBase);

    let dadosFoto = {
        fotoUrl: "",
        fotoPath: "",
        fotoAlteradaEm: null
    };

    if (arquivoFoto) {
        const upload = await enviarFotoPetStorage(empresaId, clienteId, novoPetRef.id, arquivoFoto);

        await updateDoc(novoPetRef, {
            fotoUrl: upload.fotoUrl,
            fotoPath: upload.fotoPath,
            fotoAlteradaEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });

        dadosFoto = {
            ...upload,
            fotoAlteradaEm: Timestamp.now()
        };
    }

    const petFinal = {
        id: novoPetRef.id,
        ...petBase,
        ...dadosFoto,
        criadoEm: new Date(),
        atualizadoEm: new Date()
    };

    petsGestaoCliente.push(petFinal);

    return petFinal;
}

export async function editarPet(empresaId, userOuClienteId, petId, dadosAtualizados) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId || !petId) {
        throw new Error("Parâmetros inválidos para editar pet.");
    }

    const nome = String(dadosAtualizados.nome || "").trim();
    const porte = normalizarPorte(dadosAtualizados.porte);

    if (!nome) throw new Error("Informe o nome do pet.");
    if (!porte) throw new Error("Selecione o porte do pet.");

    const payload = {
        nome,
        porte,
        raca: String(dadosAtualizados.raca || "").trim(),
        peso: String(dadosAtualizados.peso || "").trim(),
        observacoes: String(dadosAtualizados.observacoes || "").trim(),
        atualizadoEm: serverTimestamp()
    };

    const petRef = getPetRef(empresaId, clienteId, petId);
    await updateDoc(petRef, payload);

    petsGestaoCliente = petsGestaoCliente.map((p) => {
        if (p.id !== petId) return p;

        return {
            ...p,
            ...payload,
            atualizadoEm: new Date()
        };
    });

    return {
        id: petId,
        ...payload,
        atualizadoEm: new Date()
    };
}

export async function atualizarFotoPetCliente(empresaId, userOuClienteId, petId, arquivoFoto) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId || !petId) {
        throw new Error("Dados inválidos para atualizar a foto.");
    }

    validarArquivoFotoPet(arquivoFoto);

    const petRef = getPetRef(empresaId, clienteId, petId);
    const petSnap = await getDoc(petRef);

    if (!petSnap.exists()) {
        throw new Error("Pet não encontrado.");
    }

    const petAtual = {
        id: petSnap.id,
        ...petSnap.data()
    };

    if (!podeAlterarFotoPet(petAtual)) {
        const dataLiberacao = getDataLiberacaoFoto(petAtual);
        const dataStr = dataLiberacao ? dataLiberacao.toLocaleDateString("pt-BR") : "—";

        throw new Error(`FOTO_BLOQUEADA:${dataStr}`);
    }

    const dadosFoto = await enviarFotoPetStorage(empresaId, clienteId, petId, arquivoFoto);

    await updateDoc(petRef, {
        fotoUrl: dadosFoto.fotoUrl,
        fotoPath: dadosFoto.fotoPath,
        fotoAlteradaEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    });

    const atualizadoLocal = {
        ...petAtual,
        ...dadosFoto,
        fotoAlteradaEm: Timestamp.now(),
        atualizadoEm: new Date()
    };

    petsGestaoCliente = petsGestaoCliente.map((p) => {
        if (p.id !== petId) return p;
        return atualizadoLocal;
    });

    return atualizadoLocal;
}

// -----------------------------
// Modal Cadastro / Edição
// -----------------------------
export function abrirModalCadastroPet(empresaId, userOuClienteId, petExistente = null) {
    return new Promise((resolve) => {
        garantirModalPetNoHtml();

        const modal = document.getElementById("modal-pet-pronti");
        const isEdit = !!petExistente;

        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>${isEdit ? "Editar Pet" : "Cadastrar Pet"}</h2>
                            <p>${isEdit ? "Altere os dados do pet e salve." : "Preencha os dados do pet para continuar."}</p>
                        </div>
                    </div>

                    <div class="modal-pet-form">
                        <label>Nome do Pet *</label>
                        <input type="text" id="pet-nome" placeholder="Ex: Órion" value="${escapeHTML(petExistente?.nome || "")}">

                        <label>Porte *</label>
                        <select id="pet-porte">
                            <option value="">Selecione</option>
                            <option value="pequeno" ${normalizarPorte(petExistente?.porte) === "pequeno" ? "selected" : ""}>Pequeno</option>
                            <option value="medio" ${normalizarPorte(petExistente?.porte) === "medio" ? "selected" : ""}>Médio</option>
                            <option value="grande" ${normalizarPorte(petExistente?.porte) === "grande" ? "selected" : ""}>Grande</option>
                            <option value="gigante" ${normalizarPorte(petExistente?.porte) === "gigante" ? "selected" : ""}>Gigante</option>
                        </select>

                        <label>Raça</label>
                        <input type="text" id="pet-raca" placeholder="Ex: Maltês" value="${escapeHTML(petExistente?.raca || "")}">

                        <label>Peso</label>
                        <input type="text" id="pet-peso" placeholder="Ex: 3 kg" value="${escapeHTML(petExistente?.peso || "")}">

                        <label>Observações</label>
                        <textarea id="pet-observacoes" rows="3" placeholder="Ex: Sem alergias">${escapeHTML(petExistente?.observacoes || "")}</textarea>

                        <div id="pet-modal-erro" class="modal-pet-erro"></div>
                    </div>

                    <div class="modal-pet-actions">
                        <button type="button" id="btn-cancelar-pet" class="btn-pet-secondary">Cancelar</button>
                        <button type="button" id="btn-salvar-pet" class="btn-pet-primary">
                            ${isEdit ? "Salvar Alterações" : "Salvar Pet"}
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "block";

        const nomeInput = document.getElementById("pet-nome");
        const porteInput = document.getElementById("pet-porte");
        const racaInput = document.getElementById("pet-raca");
        const pesoInput = document.getElementById("pet-peso");
        const obsInput = document.getElementById("pet-observacoes");
        const btnSalvar = document.getElementById("btn-salvar-pet");
        const btnCancelar = document.getElementById("btn-cancelar-pet");

        btnCancelar.onclick = () => {
            fecharModalPet();
            resolve(null);
        };

        btnSalvar.onclick = async () => {
            try {
                btnSalvar.disabled = true;

                const dados = {
                    nome: nomeInput.value,
                    porte: porteInput.value,
                    raca: racaInput.value,
                    peso: pesoInput.value,
                    observacoes: obsInput.value
                };

                let resultado;

                if (isEdit) {
                    resultado = await editarPet(empresaId, userOuClienteId, petExistente.id, dados);
                } else {
                    resultado = await criarPetClienteGestao(empresaId, userOuClienteId, dados, null);
                }

                fecharModalPet();
                resolve(resultado);
            } catch (error) {
                mostrarErroPet(error.message || "Erro ao salvar pet.");
            } finally {
                btnSalvar.disabled = false;
            }
        };
    });
}

// -----------------------------
// Modal Preview Foto
// -----------------------------
function abrirModalPreviewFotoPet(arquivoFoto, primeiraFoto = false) {
    return new Promise((resolve) => {
        garantirModalPetNoHtml();

        const modal = document.getElementById("modal-pet-pronti");
        const previewUrl = URL.createObjectURL(arquivoFoto);

        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">📸</div>
                        <div>
                            <h2>Confirmar Foto do Pet</h2>
                            <p>Confira a foto antes de salvar.</p>
                        </div>
                    </div>

                    <div class="pet-preview-grande">
                        <img src="${previewUrl}" alt="Preview da foto do pet">
                    </div>

                    ${
                        primeiraFoto
                            ? `
                                <div class="pet-foto-aviso">
                                    Após salvar esta foto,<br>
                                    uma nova alteração somente poderá ser realizada após 30 dias.
                                </div>
                            `
                            : ""
                    }

                    <div id="pet-modal-erro" class="modal-pet-erro"></div>

                    <div class="modal-pet-actions">
                        <button type="button" id="btn-cancelar-preview-foto" class="btn-pet-secondary">Cancelar</button>
                        <button type="button" id="btn-confirmar-preview-foto" class="btn-pet-primary">Salvar Foto</button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "block";

        document.getElementById("btn-cancelar-preview-foto").onclick = () => {
            URL.revokeObjectURL(previewUrl);
            fecharModalPet();
            resolve(false);
        };

        document.getElementById("btn-confirmar-preview-foto").onclick = () => {
            URL.revokeObjectURL(previewUrl);
            fecharModalPet();
            resolve(true);
        };
    });
}

function abrirModalFotoBloqueada(dataStr) {
    garantirModalPetNoHtml();

    const modal = document.getElementById("modal-pet-pronti");

    modal.innerHTML = `
        <div class="modal-pet-overlay">
            <div class="modal-pet-card">
                <div class="modal-pet-header">
                    <div class="modal-pet-icon">📸</div>
                    <div>
                        <h2>Foto do Pet</h2>
                        <p>
                            A foto deste pet poderá ser alterada novamente em:<br>
                            <strong>${escapeHTML(dataStr || "—")}</strong>
                        </p>
                    </div>
                </div>

                <div class="modal-pet-actions um-botao">
                    <button type="button" id="btn-fechar-foto-bloqueada" class="btn-pet-secondary">Fechar</button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = "block";

    document.getElementById("btn-fechar-foto-bloqueada").onclick = () => {
        fecharModalPet();
    };
}

// -----------------------------
// Cards Gestão Pets
// -----------------------------
export function renderizarCardsPets(containerEl, pets = [], empresaId, userOuClienteId) {
    if (!containerEl) return;

    petsGestaoCliente = Array.isArray(pets) ? pets : [];

    if (petsGestaoCliente.length === 0) {
        containerEl.innerHTML = `
            <div class="pet-gestao-vazio">
                <strong>Nenhum pet cadastrado ainda.</strong>
                Cadastre seu primeiro pet para agilizar o agendamento.
            </div>
        `;
        return;
    }

    containerEl.innerHTML = petsGestaoCliente.map((pet) => {
        const raca = pet.raca ? escapeHTML(pet.raca) : "Raça não informada";
        const porte = nomePorte(pet.porte);
        const peso = pet.peso ? ` • ${escapeHTML(pet.peso)}` : "";
        const observacoes = pet.observacoes ? escapeHTML(pet.observacoes) : "SEM INFORMAÇÕES";

        return `
            <div class="pet-card-agenda" data-pet-id="${escapeHTML(pet.id)}">
                <div class="pet-card-topo">
                    <strong>🐾 PET</strong>
                    <strong>${escapeHTML(pet.nome || "Pet")}</strong>
                </div>

                <div class="pet-card-corpo">
                    <div class="pet-foto-box">
                        ${montarHtmlFotoPet(pet.fotoUrl)}
                    </div>

                    <div class="pet-card-info">
                        <h3>${escapeHTML(pet.nome || "Pet")}</h3>
                        <p>${raca} • ${escapeHTML(porte)}${peso}</p>
                    </div>
                </div>

                <div class="pet-card-bloco">
                    <div class="pet-card-bloco-titulo">📌 Informações do Pet</div>
                    <div class="pet-card-bloco-texto">${observacoes}</div>
                </div>

                <div class="pet-card-acoes">
                    <button type="button" class="btn-edit-foto" data-pet-id="${escapeHTML(pet.id)}">
                        📸 Foto do Pet
                    </button>

                    <button type="button" class="btn-edit-pet" data-pet-id="${escapeHTML(pet.id)}">
                        ✏️ Editar Pet
                    </button>

                    <input 
                        type="file" 
                        class="input-trocar-foto" 
                        data-pet-id="${escapeHTML(pet.id)}" 
                        accept="image/jpeg,image/png,image/webp" 
                        style="display:none;"
                    >
                </div>
            </div>
        `;
    }).join("");

    containerEl.querySelectorAll(".btn-edit-pet").forEach((btn) => {
        btn.onclick = async () => {
            const petId = btn.dataset.petId;
            const pet = petsGestaoCliente.find((p) => p.id === petId);

            if (!pet) return;

            const atualizado = await abrirModalCadastroPet(empresaId, userOuClienteId, pet);

            if (atualizado) {
                await buscarPetsGestaoDoCliente(empresaId, userOuClienteId);
                renderizarCardsPets(containerEl, petsGestaoCliente, empresaId, userOuClienteId);
            }
        };
    });

    containerEl.querySelectorAll(".btn-edit-foto").forEach((btn) => {
        btn.onclick = () => {
            const petId = btn.dataset.petId;
            const pet = petsGestaoCliente.find((p) => p.id === petId);

            if (!pet) return;

            if (!podeAlterarFotoPet(pet)) {
                const dataLiberacao = getDataLiberacaoFoto(pet);
                const dataStr = dataLiberacao ? dataLiberacao.toLocaleDateString("pt-BR") : "—";
                abrirModalFotoBloqueada(dataStr);
                return;
            }

            const input = containerEl.querySelector(`.input-trocar-foto[data-pet-id="${petId}"]`);
            if (input) input.click();
        };
    });

    containerEl.querySelectorAll(".input-trocar-foto").forEach((input) => {
        input.onchange = async () => {
            const petId = input.dataset.petId;
            const pet = petsGestaoCliente.find((p) => p.id === petId);
            const arquivo = input.files && input.files[0] ? input.files[0] : null;

            if (!pet || !arquivo) {
                input.value = "";
                return;
            }

            try {
                validarArquivoFotoPet(arquivo);

                const primeiraFoto = !pet.fotoUrl && !pet.fotoAlteradaEm;
                const confirmou = await abrirModalPreviewFotoPet(arquivo, primeiraFoto);

                if (!confirmou) {
                    input.value = "";
                    return;
                }

                await atualizarFotoPetCliente(empresaId, userOuClienteId, petId, arquivo);
                await buscarPetsGestaoDoCliente(empresaId, userOuClienteId);
                renderizarCardsPets(containerEl, petsGestaoCliente, empresaId, userOuClienteId);
            } catch (err) {
                if (err.message && err.message.startsWith("FOTO_BLOQUEADA:")) {
                    const dataStr = err.message.replace("FOTO_BLOQUEADA:", "");
                    abrirModalFotoBloqueada(dataStr);
                } else {
                    alert(err.message || "Erro ao trocar foto.");
                }
            } finally {
                input.value = "";
            }
        };
    });
}

// -----------------------------
// Modal principal de Gestão
// -----------------------------
export async function abrirModalGestaoPets(empresaId, userOuClienteId) {
    garantirModalPetNoHtml();

    const modal = document.getElementById("modal-pet-pronti");

    modal.innerHTML = `
        <div class="modal-pet-overlay">
            <div class="modal-pet-card">
                <div class="modal-pet-header">
                    <div class="modal-pet-icon">🐾</div>
                    <div>
                        <h2>Meus Pets</h2>
                        <p>Gerencie os pets cadastrados para seus agendamentos.</p>
                    </div>
                </div>

                <div style="margin-bottom: 14px;">
                    <button type="button" id="btn-novo-pet-gestao" class="btn-pet-primary">
                        + Cadastrar Novo Pet
                    </button>
                </div>

                <div id="lista-pets-gestao"></div>

                <div class="modal-pet-actions">
                    <button type="button" id="btn-fechar-gestao-pets" class="btn-pet-secondary">Fechar</button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = "block";

    const listaEl = document.getElementById("lista-pets-gestao");

    await buscarPetsGestaoDoCliente(empresaId, userOuClienteId);
    renderizarCardsPets(listaEl, petsGestaoCliente, empresaId, userOuClienteId);

    document.getElementById("btn-novo-pet-gestao").onclick = async () => {
        const novo = await abrirModalCadastroPet(empresaId, userOuClienteId, null);

        if (novo) {
            abrirModalGestaoPets(empresaId, userOuClienteId);
        }
    };

    document.getElementById("btn-fechar-gestao-pets").onclick = () => {
        fecharModalPet();
    };
}

// -----------------------------
// Getters
// -----------------------------
export function getPetsGestaoCliente() {
    return petsGestaoCliente;
}
```
