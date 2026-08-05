/*
=========================================================
 PRONTI PET — atendimento-mensagens.js
=========================================================

Módulo de mensagens do atendimento — lado do Pet Shop.

Responsabilidades:
- Criar automaticamente a mensagem quando o pet for liberado.
- Evitar duplicidade da mensagem de liberação.
- Permitir mensagens manuais durante o atendimento.
- Acompanhar, em tempo real, os estados:
  enviada, visualizada e confirmada.
- Manter a lógica separada do painel-atendimento.js.

Estrutura no Firestore:
empresarios/{empresaId}/agendamentos/{agendamentoId}/mensagens/{mensagemId}

Mensagem automática de liberação:
- ID fixo: liberacao
- Só é criada uma vez por agendamento.
- Exige confirmação explícita do cliente.
- O card do cliente não deve fechar sem confirmação.

Firebase Web SDK: 10.13.2
=========================================================
*/

import { db } from "./firebase-config.js";

import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export const STATUS_MENSAGEM_ATENDIMENTO = Object.freeze({
    ENVIADA: "enviada",
    VISUALIZADA: "visualizada",
    CONFIRMADA: "confirmada",
    CANCELADA: "cancelada"
});

export const TIPOS_MENSAGEM_ATENDIMENTO = Object.freeze({
    LIBERACAO: "liberacao",
    ATUALIZACAO: "atualizacao",
    OBSERVACAO: "observacao",
    URGENTE: "urgente"
});

const ID_MENSAGEM_LIBERACAO = "liberacao";

function obterColecaoMensagens(empresaId, agendamentoId) {
    validarIdentificadores(empresaId, agendamentoId);

    return collection(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId,
        "mensagens"
    );
}

function obterMensagemRef(empresaId, agendamentoId, mensagemId) {
    validarIdentificadores(empresaId, agendamentoId);

    if (!mensagemId) {
        throw new Error("mensagemId é obrigatório.");
    }

    return doc(
        db,
        "empresarios",
        empresaId,
        "agendamentos",
        agendamentoId,
        "mensagens",
        mensagemId
    );
}

export async function criarMensagemLiberacaoAtendimento({
    empresaId,
    agendamentoId,
    atendimento
}) {
    validarIdentificadores(empresaId, agendamentoId);

    if (!atendimento || typeof atendimento !== "object") {
        throw new Error("Os dados do atendimento são obrigatórios.");
    }

    const mensagemRef = obterMensagemRef(
        empresaId,
        agendamentoId,
        ID_MENSAGEM_LIBERACAO
    );

    const dadosBase = montarDadosBaseMensagem({
        empresaId,
        agendamentoId,
        atendimento
    });

    const petNome = dadosBase.petNome || "Seu pet";

    const resultado = await runTransaction(db, async (transaction) => {
        const mensagemSnap = await transaction.get(mensagemRef);

        if (mensagemSnap.exists()) {
            return {
                criada: false,
                mensagemId: mensagemRef.id,
                motivo: "mensagem_ja_existente"
            };
        }

        transaction.set(mensagemRef, {
            ...dadosBase,
            tipo: TIPOS_MENSAGEM_ATENDIMENTO.LIBERACAO,
            titulo: `${petNome} está pronto para retirada`,
            mensagem:
                `O atendimento de ${petNome} foi concluído e ` +
                "o pet já está liberado para retirada.",
            status: STATUS_MENSAGEM_ATENDIMENTO.ENVIADA,
            automatica: true,
            origem: "status_liberado",
            exigeConfirmacao: true,
            bloqueiaFechamento: true,
            criadaEm: serverTimestamp(),
            enviadaEm: serverTimestamp(),
            visualizadaEm: null,
            confirmadaEm: null,
            canceladaEm: null,
            visualizadaPor: null,
            confirmadaPor: null,
            pushStatus: "pendente",
            pushEnviadoEm: null,
            pushErro: null,
            ativa: true,
            versao: 1
        });

        return {
            criada: true,
            mensagemId: mensagemRef.id
        };
    });

    window.dispatchEvent(
        new CustomEvent("pronti-mensagem-atendimento-criada", {
            detail: {
                empresaId,
                agendamentoId,
                mensagemId: resultado.mensagemId,
                tipo: TIPOS_MENSAGEM_ATENDIMENTO.LIBERACAO,
                criada: resultado.criada
            }
        })
    );

    return resultado;
}

export async function enviarMensagemManualAtendimento({
    empresaId,
    agendamentoId,
    atendimento,
    titulo,
    mensagem,
    tipo = TIPOS_MENSAGEM_ATENDIMENTO.ATUALIZACAO,
    exigeConfirmacao = true
}) {
    validarIdentificadores(empresaId, agendamentoId);

    if (!atendimento || typeof atendimento !== "object") {
        throw new Error("Os dados do atendimento são obrigatórios.");
    }

    const tituloLimpo = limparTexto(titulo);
    const mensagemLimpa = limparTexto(mensagem);

    if (!tituloLimpo) {
        throw new Error("Informe o título da mensagem.");
    }

    if (!mensagemLimpa) {
        throw new Error("Informe a mensagem.");
    }

    if (tituloLimpo.length > 120) {
        throw new Error("O título deve ter no máximo 120 caracteres.");
    }

    if (mensagemLimpa.length > 600) {
        throw new Error("A mensagem deve ter no máximo 600 caracteres.");
    }

    const dadosBase = montarDadosBaseMensagem({
        empresaId,
        agendamentoId,
        atendimento
    });

    const novaMensagemRef = await addDoc(
        obterColecaoMensagens(empresaId, agendamentoId),
        {
            ...dadosBase,
            tipo: normalizarTipoMensagem(tipo),
            titulo: tituloLimpo,
            mensagem: mensagemLimpa,
            status: STATUS_MENSAGEM_ATENDIMENTO.ENVIADA,
            automatica: false,
            origem: "painel_atendimento",
            exigeConfirmacao: Boolean(exigeConfirmacao),
            bloqueiaFechamento: Boolean(exigeConfirmacao),
            criadaEm: serverTimestamp(),
            enviadaEm: serverTimestamp(),
            visualizadaEm: null,
            confirmadaEm: null,
            canceladaEm: null,
            visualizadaPor: null,
            confirmadaPor: null,
            pushStatus: "pendente",
            pushEnviadoEm: null,
            pushErro: null,
            ativa: true,
            versao: 1
        }
    );

    window.dispatchEvent(
        new CustomEvent("pronti-mensagem-atendimento-criada", {
            detail: {
                empresaId,
                agendamentoId,
                mensagemId: novaMensagemRef.id,
                tipo: normalizarTipoMensagem(tipo),
                criada: true
            }
        })
    );

    return {
        criada: true,
        mensagemId: novaMensagemRef.id
    };
}

export function observarMensagensAtendimento({
    empresaId,
    agendamentoId,
    aoAtualizar,
    aoErro
}) {
    validarIdentificadores(empresaId, agendamentoId);

    if (typeof aoAtualizar !== "function") {
        throw new Error("aoAtualizar deve ser uma função.");
    }

    const consulta = query(
        obterColecaoMensagens(empresaId, agendamentoId),
        orderBy("criadaEm", "desc")
    );

    return onSnapshot(
        consulta,
        (snapshot) => {
            const mensagens = snapshot.docs.map((documento) => ({
                id: documento.id,
                ...documento.data()
            }));

            aoAtualizar(mensagens);
        },
        (erro) => {
            console.error("Erro ao acompanhar mensagens do atendimento:", erro);

            if (typeof aoErro === "function") {
                aoErro(erro);
            }
        }
    );
}

export async function obterMensagemAtendimento({
    empresaId,
    agendamentoId,
    mensagemId
}) {
    const mensagemRef = obterMensagemRef(
        empresaId,
        agendamentoId,
        mensagemId
    );

    const snap = await getDoc(mensagemRef);

    if (!snap.exists()) {
        return null;
    }

    return {
        id: snap.id,
        ...snap.data()
    };
}

export async function cancelarMensagemAtendimento({
    empresaId,
    agendamentoId,
    mensagemId,
    motivo = ""
}) {
    const mensagemRef = obterMensagemRef(
        empresaId,
        agendamentoId,
        mensagemId
    );

    const snap = await getDoc(mensagemRef);

    if (!snap.exists()) {
        throw new Error("Mensagem não encontrada.");
    }

    const mensagemAtual = snap.data();

    if (mensagemAtual.status === STATUS_MENSAGEM_ATENDIMENTO.CONFIRMADA) {
        throw new Error(
            "Uma mensagem já confirmada pelo cliente não pode ser cancelada."
        );
    }

    await updateDoc(mensagemRef, {
        status: STATUS_MENSAGEM_ATENDIMENTO.CANCELADA,
        ativa: false,
        canceladaEm: serverTimestamp(),
        motivoCancelamento: limparTexto(motivo)
    });

    window.dispatchEvent(
        new CustomEvent("pronti-mensagem-atendimento-cancelada", {
            detail: {
                empresaId,
                agendamentoId,
                mensagemId
            }
        })
    );
}

export function obterResumoStatusMensagem(mensagem) {
    const status = normalizarStatusMensagem(mensagem?.status);

    if (status === STATUS_MENSAGEM_ATENDIMENTO.CONFIRMADA) {
        return {
            status,
            texto: "Cliente confirmou",
            detalhe: mensagem?.confirmadaEm || null,
            conclusivo: true
        };
    }

    if (status === STATUS_MENSAGEM_ATENDIMENTO.VISUALIZADA) {
        return {
            status,
            texto: "Cliente visualizou",
            detalhe: mensagem?.visualizadaEm || null,
            conclusivo: false
        };
    }

    if (status === STATUS_MENSAGEM_ATENDIMENTO.CANCELADA) {
        return {
            status,
            texto: "Mensagem cancelada",
            detalhe: mensagem?.canceladaEm || null,
            conclusivo: true
        };
    }

    return {
        status: STATUS_MENSAGEM_ATENDIMENTO.ENVIADA,
        texto: "Aguardando confirmação",
        detalhe: mensagem?.enviadaEm || mensagem?.criadaEm || null,
        conclusivo: false
    };
}

function montarDadosBaseMensagem({
    empresaId,
    agendamentoId,
    atendimento
}) {
    return {
        empresaId,
        agendamentoId,
        clienteId: obterPrimeiroValor(atendimento, [
            "clienteId",
            "usuarioClienteId",
            "tutorId",
            "cliente.id",
            "tutor.id",
            "userId",
            "uidCliente"
        ]),
        clienteNome: obterPrimeiroValor(atendimento, [
            "clienteNome",
            "nomeCliente",
            "tutorNome",
            "cliente.nome",
            "tutor.nome"
        ]) || "Cliente",
        petId: obterPrimeiroValor(atendimento, [
            "petId",
            "animalId",
            "pet.id",
            "animal.id"
        ]),
        petNome: obterPrimeiroValor(atendimento, [
            "petNome",
            "nomePet",
            "nomeAnimal",
            "pet.nome",
            "animal.nome"
        ]) || "Seu pet",
        petFotoUrl: obterPrimeiroValor(atendimento, [
            "petFotoUrl",
            "fotoPetUrl",
            "pet.fotoUrl",
            "fotoAnimal",
            "animal.fotoUrl"
        ]),
        servicoId: obterPrimeiroValor(atendimento, [
            "servicoId",
            "servico.id"
        ]),
        servicoNome: obterPrimeiroValor(atendimento, [
            "servicoNome",
            "nomeServico",
            "servico.nome",
            "servico",
            "tipoServico"
        ]) || "Atendimento",
        profissionalId: obterPrimeiroValor(atendimento, [
            "profissionalId",
            "funcionarioId",
            "colaboradorId"
        ]),
        profissionalNome: obterPrimeiroValor(atendimento, [
            "profissionalNome",
            "funcionarioNome",
            "colaboradorNome"
        ]),
        atendimentoStatusOrigem:
            atendimento.statusAtendimento || atendimento.status || null
    };
}

function validarIdentificadores(empresaId, agendamentoId) {
    if (!empresaId) {
        throw new Error("empresaId é obrigatório.");
    }

    if (!agendamentoId) {
        throw new Error("agendamentoId é obrigatório.");
    }
}

function limparTexto(valor) {
    return String(valor ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarStatusMensagem(status) {
    const valor = limparTexto(status).toLowerCase();
    const statusValidos = Object.values(STATUS_MENSAGEM_ATENDIMENTO);

    return statusValidos.includes(valor)
        ? valor
        : STATUS_MENSAGEM_ATENDIMENTO.ENVIADA;
}

function normalizarTipoMensagem(tipo) {
    const valor = limparTexto(tipo).toLowerCase();
    const tiposValidos = Object.values(TIPOS_MENSAGEM_ATENDIMENTO);

    return tiposValidos.includes(valor)
        ? valor
        : TIPOS_MENSAGEM_ATENDIMENTO.ATUALIZACAO;
}

function obterPrimeiroValor(objeto, caminhos) {
    for (const caminho of caminhos) {
        const valor = obterValorPorCaminho(objeto, caminho);

        if (
            valor !== undefined &&
            valor !== null &&
            String(valor).trim() !== ""
        ) {
            return valor;
        }
    }

    return null;
}

function obterValorPorCaminho(objeto, caminho) {
    return String(caminho)
        .split(".")
        .reduce((valorAtual, chave) => {
            if (valorAtual === undefined || valorAtual === null) {
                return undefined;
            }

            return valorAtual[chave];
        }, objeto);
}
