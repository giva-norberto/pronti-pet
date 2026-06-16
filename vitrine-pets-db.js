// ======================================================================
// ARQUIVO: vitrine-pets-db.js
// PRONTI PET - Camada compartilhada de dados dos Pets
// ======================================================================
//
// Este arquivo centraliza:
// - Firestore dos pets
// - Cliente da vitrine
// - Upload da foto do pet
// - Trava de 30 dias
// - Utilitários de porte
//
// Usado por:
// - vitrine-pets.js
// - vitrine-pets-gestao.js
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
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

import { db } from "./vitrini-firebase.js";

// ======================================================================
// Utilitários
// ======================================================================

export function normalizarPorte(porte) {
    return String(porte || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

export function nomePorte(porte) {
    const mapa = {
        pequeno: "Pequeno",
        medio: "Médio",
        grande: "Grande",
        gigante: "Gigante"
    };

    return mapa[normalizarPorte(porte)] || "Porte não informado";
}

export function escapeHTML(valor) {
    const div = document.createElement("div");
    div.textContent = valor || "";
    return div.innerHTML;
}

export function getClienteId(userOuClienteId) {
    if (!userOuClienteId) return "";
    if (typeof userOuClienteId === "string") return userOuClienteId;
    return userOuClienteId.uid || userOuClienteId.id || "";
}

export function getDataFotoAlteradaEm(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    if (valor instanceof Date) return valor;

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

export function getDataLiberacaoFoto(pet) {
    const data = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);
    if (!data) return null;

    return new Date(data.getTime() + 30 * 24 * 60 * 60 * 1000);
}

export function podeAlterarFotoPet(pet) {
    if (!pet?.fotoUrl && !pet?.fotoAlteradaEm) return true;

    const dataAlteracao = getDataFotoAlteradaEm(pet?.fotoAlteradaEm);
    if (!dataAlteracao) return true;

    const agora = new Date();
    const diasPassados = Math.floor(
        (agora.getTime() - dataAlteracao.getTime()) / (1000 * 60 * 60 * 24)
    );

    return diasPassados >= 30;
}

export function validarArquivoFotoPet(arquivo) {
    if (!arquivo) {
        throw new Error("Escolha uma foto para continuar.");
    }

    const tiposPermitidos = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const tamanhoMaximo = 5 * 1024 * 1024;

    if (!tiposPermitidos.includes(arquivo.type)) {
        throw new Error("A foto precisa ser JPG, PNG ou WEBP.");
    }

    if (arquivo.size > tamanhoMaximo) {
        throw new Error("A foto precisa ter no máximo 5 MB.");
    }
}

// ======================================================================
// Referências Firestore / Storage
// ======================================================================

export function getClienteRef(empresaId, clienteId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId);
}

export function getClientePetsRef(empresaId, clienteId) {
    return collection(db, "empresarios", empresaId, "clientes", clienteId, "pets");
}

export function getPetRef(empresaId, clienteId, petId) {
    return doc(db, "empresarios", empresaId, "clientes", clienteId, "pets", petId);
}

export function getFotoPetPath(empresaId, clienteId, petId) {
    return `empresarios/${empresaId}/clientes/${clienteId}/pets/${petId}/fotoPet.jpg`;
}

// ======================================================================
// Cliente
// ======================================================================

export async function garantirClientePet(empresaId, userOuClienteId) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId) return;

    const user = typeof userOuClienteId === "object" ? userOuClienteId : null;

    const clienteRef = getClienteRef(empresaId, clienteId);
    const clienteSnap = await getDoc(clienteRef);

    const dadosAtuais = clienteSnap.exists() ? clienteSnap.data() : {};

    await setDoc(clienteRef, {
        nome: dadosAtuais.nome || user?.displayName || "Cliente",
        email: dadosAtuais.email || user?.email || "",
        atualizadoEm: serverTimestamp(),
        dataCadastro: dadosAtuais.dataCadastro || serverTimestamp()
    }, { merge: true });
}

// ======================================================================
// Buscar Pets
// ======================================================================

export async function buscarPetsDoCliente(empresaId, userOuClienteId) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId) return [];

    const petsRef = getClientePetsRef(empresaId, clienteId);
    const snap = await getDocs(petsRef);

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }))
        .filter((pet) => pet.ativo !== false);
}

// ======================================================================
// Criar Pet
// ======================================================================

export async function criarPetCliente(empresaId, userOuClienteId, dadosPet, arquivoFoto = null) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");

    const nome = String(dadosPet.nome || "").trim();
    const porte = normalizarPorte(dadosPet.porte);

    if (!nome) throw new Error("Informe o nome do pet.");

    if (!["pequeno", "medio", "grande", "gigante"].includes(porte)) {
        throw new Error("Selecione um porte válido para o pet.");
    }

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
        const upload = await enviarFotoPetStorage(
            empresaId,
            clienteId,
            novoPetRef.id,
            arquivoFoto
        );

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

    return {
        id: novoPetRef.id,
        ...petBase,
        ...dadosFoto,
        criadoEm: new Date(),
        atualizadoEm: new Date()
    };
}

// ======================================================================
// Editar Pet
// ======================================================================

export async function editarPetCliente(empresaId, userOuClienteId, petId, dadosAtualizados) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");
    if (!petId) throw new Error("Pet não identificado.");

    const nome = String(dadosAtualizados.nome || "").trim();
    const porte = normalizarPorte(dadosAtualizados.porte);

    if (!nome) throw new Error("Informe o nome do pet.");

    if (!["pequeno", "medio", "grande", "gigante"].includes(porte)) {
        throw new Error("Selecione um porte válido para o pet.");
    }

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

    return {
        id: petId,
        ...payload,
        atualizadoEm: new Date()
    };
}

// ======================================================================
// Upload Foto Pet
// ======================================================================

export async function enviarFotoPetStorage(empresaId, clienteId, petId, arquivoFoto) {
    validarArquivoFotoPet(arquivoFoto);

    const storage = getStorage();
    const fotoPath = getFotoPetPath(empresaId, clienteId, petId);
    const fotoRef = storageRef(storage, fotoPath);

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
// Atualizar Foto Pet - com trava de 30 dias
// ======================================================================

export async function atualizarFotoPetCliente(empresaId, userOuClienteId, petId, arquivoFoto) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId) throw new Error("Empresa não identificada.");
    if (!clienteId) throw new Error("Cliente não identificado.");
    if (!petId) throw new Error("Pet não identificado.");

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

    return {
        ...petAtual,
        ...dadosFoto,
        fotoAlteradaEm: Timestamp.now(),
        atualizadoEm: new Date()
    };
}

// ======================================================================
// Buscar Pet por ID
// ======================================================================

export async function buscarPetPorId(empresaId, userOuClienteId, petId) {
    const clienteId = getClienteId(userOuClienteId);

    if (!empresaId || !clienteId || !petId) return null;

    const petRef = getPetRef(empresaId, clienteId, petId);
    const petSnap = await getDoc(petRef);

    if (!petSnap.exists()) return null;

    return {
        id: petSnap.id,
        ...petSnap.data()
    };
}
