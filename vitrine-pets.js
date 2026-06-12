// ======================================================================
// ARQUIVO: vitrine-pets.js
// PRONTI PET - Cadastro, gestão e seleção de pet do cliente na vitrine
// ======================================================================

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

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

function getPetRef(empresaId, clienteId, petId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId, "pets", petId);
}

function getFotoPetPath(empresaId, clienteId, petId) {
    return `empresarios/${empresaId}/clientes/${clienteId}/pets/${petId}/fotoPet.jpg`;
}

function getDataFotoAlteradaEm(valor) {
    if (!valor) return null;

    if (typeof valor.toDate === "function") {
        return valor.toDate();
    }

    if (valor instanceof Date) {
        return valor;
    }

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function podeAlterarFotoPet(pet) {
    if (!pet?.fotoUrl && !pet?.fotoAlteradaEm) {
        return true;
    }

    const dataAlteracao = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);

    if (!dataAlteracao) {
        return true;
    }

    const agora = new Date();
    const diasPassados = Math.floor(
        (agora.getTime() - dataAlteracao.getTime()) / (1000 * 60 * 60 * 24)
    );

    return diasPassados >= 30;
}

function diasParaLiberarTrocaFoto(pet) {
    const dataAlteracao = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);

    if (!dataAlteracao) {
        return 0;
    }

    const agora = new Date();
    const diasPassados = Math.floor(
        (agora.getTime() - dataAlteracao.getTime()) / (1000 * 60 * 60 * 24)
    );

    const restante = 30 - diasPassados;

    return restante > 0 ? restante : 0;
}

function montarHtmlPreviewFoto(url) {
    if (!url) return "🐾";

    return `<img src="${escapeHTML(url)}" alt="Foto do pet">`;
}

function validarArquivoFotoPet(arquivo) {
    if (!arquivo) return;

    const tiposPermitidos = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const tamanhoMaximo = 5 * 1024 * 1024;

    if (!tiposPermitidos.includes(arquivo.type)) {
        throw new Error("A foto precisa ser JPG, PNG ou WEBP.");
    }

    if (arquivo.size > tamanhoMaximo) {
        throw new Error("A foto precisa ter no máximo 5 MB.");
    }
}

async function enviarFotoPetStorage(empresaId, clienteId, petId, arquivoFoto) {
    if (!arquivoFoto) {
        return {
            fotoUrl: "",
            fotoPath: ""
        };
    }

    validarArquivoFotoPet(arquivoFoto);

    const storage = getStorage();
    const fotoPath = getFotoPetPath(empresaId, clienteId, petId);
    const fotoRef = ref(storage, fotoPath);

    await uploadBytes(fotoRef, arquivoFoto, {
        contentType: arquivoFoto.type || "image/jpeg"
    });

    const fotoUrl = await getDownloadURL(fotoRef);

    return {
        fotoUrl,
        fotoPath
    };
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
// Salvar pet
// ======================================================================

export async function salvarPetCliente(empresaId, clienteId, dadosPet) {
    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");

    const nome = String(dadosPet.nome || "").trim();
    const porte = normalizarPorte(dadosPet.porte);
    const arquivoFoto = dadosPet.fotoArquivo || null;

    if (!nome) {
        throw new Error("Informe o nome do pet.");
    }

    if (!["pequeno", "medio", "grande", "gigante"].includes(porte)) {
        throw new Error("Selecione um porte válido para o pet.");
    }

    if (arquivoFoto) {
        validarArquivoFotoPet(arquivoFoto);
    }

    const pet = {
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
    const novoPetRef = await addDoc(petsRef, pet);

    let dadosFoto = {
        fotoUrl: "",
        fotoPath: ""
    };

    if (arquivoFoto) {
        dadosFoto = await enviarFotoPetStorage(
            empresaId,
            clienteId,
            novoPetRef.id,
            arquivoFoto
        );

        await updateDoc(novoPetRef, {
            fotoUrl: dadosFoto.fotoUrl,
            fotoPath: dadosFoto.fotoPath,
            fotoAlteradaEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
    }

    petSelecionado = {
        id: novoPetRef.id,
        ...pet,
        ...dadosFoto,
        fotoAlteradaEm: arquivoFoto ? Timestamp.now() : null,
        criadoEm: new Date(),
        atualizadoEm: new Date()
    };

    petsCliente.push(petSelecionado);

    return petSelecionado;
}

// ======================================================================
// Atualizar foto do pet existente - trava de 30 dias
// ======================================================================

export async function atualizarFotoPetCliente(empresaId, clienteId, petId, arquivoFoto) {
    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");
    if (!petId) throw new Error("Pet não identificado.");
    if (!arquivoFoto) throw new Error("Escolha uma foto para continuar.");

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
        const dias = diasParaLiberarTrocaFoto(petAtual);
        throw new Error(`A foto deste pet só poderá ser alterada novamente em ${dias} dia(s).`);
    }

    const dadosFoto = await enviarFotoPetStorage(
        empresaId,
        clienteId,
        petId,
        arquivoFoto
    );

    await updateDoc(petRef, {
        fotoUrl: dadosFoto.fotoUrl,
        fotoPath: dadosFoto.fotoPath,
        fotoAlteradaEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    });

    petsCliente = petsCliente.map((pet) => {
        if (pet.id !== petId) return pet;

        return {
            ...pet,
            ...dadosFoto,
            fotoAlteradaEm: Timestamp.now(),
            atualizadoEm: new Date()
        };
    });

    if (petSelecionado?.id === petId) {
        petSelecionado = {
            ...petSelecionado,
            ...dadosFoto,
            fotoAlteradaEm: Timestamp.now(),
            atualizadoEm: new Date()
        };
    }

    return {
        ...petAtual,
        ...dadosFoto,
        fotoAlteradaEm: Timestamp.now(),
        atualizadoEm: new Date()
    };
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
// Modal HTML e estilos
// ======================================================================

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

        .modal-pet-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
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

        .modal-pet-foto-box {
            border: 1.5px dashed #c7d2fe;
            background: #f8fafc;
            border-radius: 16px;
            padding: 14px;
            margin-bottom: 14px;
        }

        .modal-pet-foto-topo {
            display: flex;
            gap: 14px;
            align-items: center;
        }

        .modal-pet-preview {
            width: 92px;
            height: 92px;
            border-radius: 18px;
            background: #eef2ff;
            border: 1px solid #dbe3ef;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6366f1;
            font-size: 2.1rem;
            flex-shrink: 0;
            overflow: hidden;
        }

        .modal-pet-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .modal-pet-foto-info {
            flex: 1;
        }

        .modal-pet-foto-info strong {
            display: block;
            color: #1e293b;
            font-size: 0.98rem;
            margin-bottom: 4px;
        }

        .modal-pet-foto-info span {
            display: block;
            color: #64748b;
            font-size: 0.82rem;
            line-height: 1.3;
            margin-bottom: 9px;
        }

        .modal-pet-foto-input {
            display: none;
        }

        .btn-pet-foto,
        .btn-pet-primary,
        .btn-pet-secondary,
        .btn-pet-danger {
            border: none;
            border-radius: 12px;
            padding: 11px 14px;
            font-weight: 900;
            font-size: 0.92rem;
            cursor: pointer;
            font-family: inherit;
        }

        .btn-pet-foto {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            background: #4f46e5;
            color: #fff;
            padding: 9px 12px;
            font-size: 0.88rem;
        }

        .btn-pet-primary {
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: #fff;
        }

        .btn-pet-secondary {
            background: #eef2ff;
            color: #4338ca;
        }

        .btn-pet-danger {
            background: #fee2e2;
            color: #b91c1c;
        }

        .btn-pet-primary:disabled,
        .btn-pet-secondary:disabled,
        .btn-pet-danger:disabled,
        .btn-pet-foto:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }

        .modal-pet-aviso-foto {
            margin-top: 12px;
            background: #fff7ed;
            border: 1px solid #fed7aa;
            color: #9a3412;
            border-radius: 13px;
            padding: 10px 12px;
            font-size: 0.84rem;
            font-weight: 700;
            line-height: 1.35;
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
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .modal-pet-actions.um-botao {
            grid-template-columns: 1fr;
        }

        .lista-pets-modal {
            display: grid;
            gap: 10px;
        }

        .pet-opcao-btn,
        .pet-gestao-card {
            width: 100%;
            border: 1.5px solid #e0e7ff;
            background: #f8fafc;
            border-radius: 16px;
            padding: 13px;
            box-sizing: border-box;
            font-family: inherit;
        }

        .pet-opcao-btn {
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

        .pet-opcao-dados,
        .pet-gestao-topo {
            display: flex;
            align-items: center;
            gap: 11px;
            min-width: 0;
        }

        .pet-opcao-foto,
        .pet-gestao-foto {
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

        .pet-opcao-foto img,
        .pet-gestao-foto img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pet-opcao-texto,
        .pet-gestao-texto {
            display: grid;
            text-align: left;
            min-width: 0;
        }

        .pet-opcao-texto strong,
        .pet-gestao-texto strong {
            color: #1e293b;
            font-size: 1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .pet-opcao-texto small,
        .pet-gestao-texto small {
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

        .pet-gestao-card {
            display: grid;
            gap: 10px;
        }

        .pet-gestao-obs {
            background: #fff;
            border: 1px solid #e2e8f0;
            color: #475569;
            border-radius: 12px;
            padding: 8px 10px;
            font-size: 0.84rem;
            line-height: 1.35;
        }

        .pet-gestao-acoes {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .pet-gestao-vazio {
            background: #f8fafc;
            border: 1.5px dashed #c7d2fe;
            border-radius: 16px;
            padding: 18px;
            text-align: center;
            color: #475569;
            font-weight: 700;
            line-height: 1.4;
        }

        .pet-gestao-vazio strong {
            display: block;
            color: #4f46e5;
            margin-bottom: 5px;
            font-size: 1.02rem;
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

            .modal-pet-foto-topo {
                align-items: flex-start;
            }

            .modal-pet-preview {
                width: 82px;
                height: 82px;
            }

            .modal-pet-actions {
                grid-template-columns: 1fr;
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
// Abrir modal de cadastro de pet
// ======================================================================

export function abrirModalCadastroPet(empresaId, user) {
    return new Promise((resolve) => {
        garantirModalPetNoHtml();

        const modal = document.getElementById("modal-pet-pronti");

        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>Cadastre seu Pet</h2>
                            <p>Preencha os dados do pet e confira a foto antes de salvar.</p>
                        </div>
                    </div>

                    <div class="modal-pet-form">
                        <div class="modal-pet-foto-box">
                            <div class="modal-pet-foto-topo">
                                <div id="pet-foto-preview" class="modal-pet-preview">🐾</div>

                                <div class="modal-pet-foto-info">
                                    <strong>Foto do Pet</strong>
                                    <span>Escolha uma foto clara. Você verá o preview antes de salvar.</span>

                                    <button type="button" id="btn-escolher-foto-pet" class="btn-pet-foto">
                                        📷 Escolher Foto
                                    </button>

                                    <input
                                        type="file"
                                        id="pet-foto-arquivo"
                                        class="modal-pet-foto-input"
                                        accept="image/jpeg,image/png,image/webp"
                                    >
                                </div>
                            </div>

                            <div class="modal-pet-aviso-foto">
                                Após salvar esta foto, uma nova alteração somente poderá ser realizada após 30 dias.
                            </div>
                        </div>

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
                        <button type="button" id="btn-cancelar-pet" class="btn-pet-secondary">
                            Cancelar
                        </button>

                        <button type="button" id="btn-salvar-pet" class="btn-pet-primary">
                            Salvar Pet
                        </button>
                    </div>
                </div>
            </div>
        `;

        const nomeInput = document.getElementById("pet-nome");
        const porteInput = document.getElementById("pet-porte");
        const racaInput = document.getElementById("pet-raca");
        const pesoInput = document.getElementById("pet-peso");
        const obsInput = document.getElementById("pet-observacoes");
        const fotoInput = document.getElementById("pet-foto-arquivo");
        const previewEl = document.getElementById("pet-foto-preview");
        const btnEscolherFoto = document.getElementById("btn-escolher-foto-pet");
        const erroEl = document.getElementById("pet-modal-erro");
        const btnSalvar = document.getElementById("btn-salvar-pet");
        const btnCancelar = document.getElementById("btn-cancelar-pet");

        let fotoArquivoSelecionado = null;
        let previewObjectUrl = null;

        function cancelar() {
            if (previewObjectUrl) {
                URL.revokeObjectURL(previewObjectUrl);
            }

            fecharModalPet();
            resolve(null);
        }

        erroEl.style.display = "none";
        erroEl.textContent = "";
        modal.style.display = "block";

        setTimeout(() => nomeInput.focus(), 100);

        btnCancelar.onclick = cancelar;

        btnEscolherFoto.onclick = () => {
            fotoInput.click();
        };

        fotoInput.onchange = () => {
            try {
                erroEl.style.display = "none";
                erroEl.textContent = "";

                const arquivo = fotoInput.files && fotoInput.files[0] ? fotoInput.files[0] : null;

                if (!arquivo) return;

                validarArquivoFotoPet(arquivo);

                if (previewObjectUrl) {
                    URL.revokeObjectURL(previewObjectUrl);
                }

                fotoArquivoSelecionado = arquivo;
                previewObjectUrl = URL.createObjectURL(arquivo);
                previewEl.innerHTML = montarHtmlPreviewFoto(previewObjectUrl);

            } catch (error) {
                fotoArquivoSelecionado = null;
                fotoInput.value = "";
                previewEl.innerHTML = "🐾";
                erroEl.textContent = error.message || "Erro ao carregar foto.";
                erroEl.style.display = "block";
            }
        };

        btnSalvar.onclick = async () => {
            try {
                btnSalvar.disabled = true;
                btnCancelar.disabled = true;
                btnSalvar.textContent = "Salvando...";
                erroEl.style.display = "none";
                erroEl.textContent = "";

                const pet = await salvarPetCliente(empresaId, user.uid, {
                    nome: nomeInput.value,
                    porte: porteInput.value,
                    raca: racaInput.value,
                    peso: pesoInput.value,
                    observacoes: obsInput.value,
                    fotoArquivo: fotoArquivoSelecionado
                });

                if (previewObjectUrl) {
                    URL.revokeObjectURL(previewObjectUrl);
                }

                fecharModalPet();
                resolve(pet);

            } catch (error) {
                erroEl.textContent = error.message || "Erro ao salvar pet.";
                erroEl.style.display = "block";
            } finally {
                btnSalvar.disabled = false;
                btnCancelar.disabled = false;
                btnSalvar.textContent = "Salvar Pet";
            }
        };
    });
}

// ======================================================================
// Modal de gestão dos pets do cliente
// ======================================================================

export async function abrirModalGestaoPets(empresaId, user) {
    garantirModalPetNoHtml();

    const modal = document.getElementById("modal-pet-pronti");

    if (!empresaId || !user) {
        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>Meus Pets</h2>
                            <p>Você precisa estar logado para gerenciar seus pets.</p>
                        </div>
                    </div>

                    <div class="modal-pet-actions um-botao">
                        <button type="button" id="btn-fechar-gestao-pets" class="btn-pet-secondary">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "block";

        document.getElementById("btn-fechar-gestao-pets").onclick = () => {
            fecharModalPet();
        };

        return;
    }

    async function renderizarGestao() {
        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>Meus Pets</h2>
                            <p>Carregando seus pets cadastrados...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "block";

        await garantirClientePet(empresaId, user);
        const pets = await buscarPetsDoCliente(empresaId, user.uid);

        modal.innerHTML = `
            <div class="modal-pet-overlay">
                <div class="modal-pet-card">
                    <div class="modal-pet-header">
                        <div class="modal-pet-icon">🐾</div>
                        <div>
                            <h2>Meus Pets</h2>
                            <p>Veja seus pets cadastrados ou adicione um novo pet.</p>
                        </div>
                    </div>

                    <div id="lista-pets-gestao" class="lista-pets-modal">
                        ${
                            pets.length === 0
                                ? `
                                    <div class="pet-gestao-vazio">
                                        <strong>Nenhum pet cadastrado ainda.</strong>
                                        Cadastre seu primeiro pet para agilizar o agendamento.
                                    </div>
                                `
                                : pets.map((pet) => {
                                    const bloqueado = !podeAlterarFotoPet(pet);
                                    const dias = diasParaLiberarTrocaFoto(pet);

                                    return `
                                        <div class="pet-gestao-card" data-pet-id="${escapeHTML(pet.id)}">
                                            <div class="pet-gestao-topo">
                                                <div class="pet-gestao-foto">
                                                    ${montarHtmlPreviewFoto(pet.fotoUrl)}
                                                </div>

                                                <div class="pet-gestao-texto">
                                                    <strong>${escapeHTML(pet.nome || "Pet")}</strong>
                                                    <small>
                                                        ${
                                                            pet.raca
                                                                ? `${escapeHTML(pet.raca)} • ${nomePorte(pet.porte)}`
                                                                : nomePorte(pet.porte)
                                                        }
                                                        ${pet.peso ? ` • ${escapeHTML(pet.peso)}` : ""}
                                                    </small>
                                                </div>
                                            </div>

                                            ${
                                                pet.observacoes
                                                    ? `
                                                        <div class="pet-gestao-obs">
                                                            <strong>Observações:</strong>
                                                            ${escapeHTML(pet.observacoes)}
                                                        </div>
                                                    `
                                                    : ""
                                            }

                                            <div class="pet-gestao-acoes">
                                                <button
                                                    type="button"
                                                    class="btn-pet-secondary btn-trocar-foto-pet"
                                                    data-pet-id="${escapeHTML(pet.id)}"
                                                    ${bloqueado ? "disabled" : ""}
                                                >
                                                    📷 Trocar Foto
                                                </button>

                                                ${
                                                    bloqueado
                                                        ? `
                                                            <button type="button" class="btn-pet-danger" disabled>
                                                                Bloqueado ${dias} dia(s)
                                                            </button>
                                                        `
                                                        : ""
                                                }

                                                <input
                                                    type="file"
                                                    class="input-trocar-foto-pet"
                                                    data-pet-id="${escapeHTML(pet.id)}"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    style="display:none;"
                                                >
                                            </div>
                                        </div>
                                    `;
                                }).join("")
                        }
                    </div>

                    <div id="pet-gestao-erro" class="modal-pet-erro"></div>

                    <div class="modal-pet-actions">
                        <button type="button" id="btn-fechar-gestao-pets" class="btn-pet-secondary">
                            Fechar
                        </button>

                        <button type="button" id="btn-novo-pet-gestao" class="btn-pet-primary">
                            + Novo Pet
                        </button>
                    </div>
                </div>
            </div>
        `;

        const btnFechar = document.getElementById("btn-fechar-gestao-pets");
        const btnNovo = document.getElementById("btn-novo-pet-gestao");
        const erroEl = document.getElementById("pet-gestao-erro");

        btnFechar.onclick = () => {
            fecharModalPet();
        };

        btnNovo.onclick = async () => {
            const novoPet = await abrirModalCadastroPet(empresaId, user);

            if (novoPet) {
                await renderizarGestao();
            }
        };

        modal.querySelectorAll(".btn-trocar-foto-pet").forEach((btn) => {
            btn.onclick = () => {
                const petId = btn.dataset.petId;
                const input = modal.querySelector(`.input-trocar-foto-pet[data-pet-id="${petId}"]`);

                if (input) {
                    input.click();
                }
            };
        });

        modal.querySelectorAll(".input-trocar-foto-pet").forEach((input) => {
            input.onchange = async () => {
                const petId = input.dataset.petId;
                const arquivo = input.files && input.files[0] ? input.files[0] : null;

                if (!arquivo) return;

                try {
                    erroEl.style.display = "none";
                    erroEl.textContent = "";

                    await atualizarFotoPetCliente(
                        empresaId,
                        user.uid,
                        petId,
                        arquivo
                    );

                    await renderizarGestao();

                } catch (error) {
                    input.value = "";
                    erroEl.textContent = error.message || "Erro ao trocar foto.";
                    erroEl.style.display = "block";
                }
            };
        });
    }

    await renderizarGestao();
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
                                                    ? `${escapeHTML(pet.raca)} • ${nomePorte(pet.porte)}`
                                                    : nomePorte(pet.porte)
                                            }
                                        </small>
                                    </div>
                                </div>

                                <span>Selecionar</span>
                            </button>
                        `).join("")}
                    </div>

                    <div class="modal-pet-actions um-botao">
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
