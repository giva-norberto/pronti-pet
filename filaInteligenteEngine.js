import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js";

import { db } from "./vitrini-firebase.js";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// ============================================================================
// CONFIG
// ============================================================================

const functions = getFunctions(undefined, "southamerica-east1");

// ============================================================================
// STATUS OFICIAIS
// ============================================================================

export const STATUS_FILA = {
  AGUARDANDO: "aguardando",
  OFERTA_ENVIADA: "oferta_enviada",
  CONFIRMADO: "confirmado",
  RECUSADO: "recusado",
  EXPIRADO: "expirado",
  CANCELADO: "cancelado"
};

export const STATUS_OFERTA = {
  PENDENTE: "pendente",
  CONFIRMADA: "confirmada",
  RECUSADA: "recusada",
  EXPIRADA: "expirada"
};

// ============================================================================
// FUNÇÕES FIREBASE
// ============================================================================

export async function ofertarVagaParaFila(empresaId, vaga) {
  try {
    const fn = httpsCallable(functions, "ofertarVagaParaFila");

    const res = await fn({
      empresaId,
      vaga
    });

    return res.data || {
      ok: false,
      motivo: "sem_resposta"
    };
  } catch (error) {
    console.error("❌ Erro em ofertarVagaParaFila:", error);

    return {
      ok: false,
      motivo: "erro_backend",
      erro: error?.message || error?.toString?.()
    };
  }
}

export async function processarOfertasExpiradas(empresaId) {
  try {
    const fn = httpsCallable(functions, "processarOfertasExpiradas");

    const res = await fn({
      empresaId
    });

    return res.data || {
      ok: false,
      motivo: "sem_resposta"
    };
  } catch (error) {
    console.error("❌ Erro em processarOfertasExpiradas:", error);

    return {
      ok: false,
      motivo: "erro_backend",
      erro: error?.message || error?.toString?.()
    };
  }
}

export async function confirmarOfertaFila(empresaId, ofertaId) {
  try {
    const fn = httpsCallable(functions, "confirmarOfertaFila");

    const res = await fn({
      empresaId,
      ofertaId
    });

    return res.data || {
      ok: false,
      motivo: "sem_resposta"
    };
  } catch (error) {
    console.error("❌ Erro em confirmarOfertaFila:", error);

    return {
      ok: false,
      motivo: "erro_backend",
      erro: error?.message || error?.toString?.()
    };
  }
}

export async function recusarOfertaFila(empresaId, ofertaId) {
  try {
    const fn = httpsCallable(functions, "recusarOfertaFila");

    const res = await fn({
      empresaId,
      ofertaId
    });

    return res.data || {
      ok: false,
      motivo: "sem_resposta"
    };
  } catch (error) {
    console.error("❌ Erro em recusarOfertaFila:", error);

    return {
      ok: false,
      motivo: "erro_backend",
      erro: error?.message || error?.toString?.()
    };
  }
}

// ============================================================================
// NORMALIZAÇÃO
// ============================================================================

function normalizarStatusFila(status) {
  switch (status) {
    case "fila":
      return STATUS_FILA.AGUARDANDO;

    case "atendido":
      return STATUS_FILA.CONFIRMADO;

    case "aceita":
      return STATUS_FILA.CONFIRMADO;

    case "ofertado":
      return STATUS_FILA.OFERTA_ENVIADA;

    default:
      return status || STATUS_FILA.AGUARDANDO;
  }
}

function normalizarStatusOferta(status) {
  switch (status) {
    case "aceita":
      return STATUS_OFERTA.CONFIRMADA;

    default:
      return status || STATUS_OFERTA.PENDENTE;
  }
}

function normalizarFila(item) {
  return {
    ...item,

    status: normalizarStatusFila(item?.status),

    clienteNome: item?.clienteNome || "Cliente",

    profissionalNome:
      item?.profissionalNome ||
      "Qualquer profissional",

    dataDesejada:
      item?.dataDesejada ||
      item?.dataFila ||
      null,

    horariosAceitos:
      item?.horariosAceitos ||
      [],

    criadoEm:
      item?.criadoEm ||
      null
  };
}

function normalizarOferta(item) {
  return {
    ...item,

    status: normalizarStatusOferta(item?.status),

    clienteNome:
      item?.clienteNome ||
      "Cliente",

    profissionalNome:
      item?.profissionalNome ||
      "Profissional",

    servicoNome:
      item?.servicoNome ||
      "-",

    horario:
      item?.horario ||
      "-",

    data:
      item?.data ||
      "-"
  };
}

// ============================================================================
// LISTENERS DE OFERTAS
// ============================================================================

export function ouvirOfertasFila(empresaId, callback) {
  try {
    const ofertasRef = collection(
      db,
      "empresarios",
      empresaId,
      "ofertas_fila"
    );

    const qOfertas = query(
      ofertasRef,
      orderBy("createdAt", "desc"),
      limit(100)
    );

    return onSnapshot(
      qOfertas,
      (snap) => {
        const lista = snap.docs.map((d) => {
          return normalizarOferta({
            id: d.id,
            ...d.data()
          });
        });

        callback(lista);
      },
      (error) => {
        console.error("❌ Listener ofertas fila:", error);
        callback([]);
      }
    );
  } catch (error) {
    console.error("❌ Erro ao iniciar listener ofertas:", error);

    callback([]);

    return () => {};
  }
}

// ============================================================================
// LISTENERS DE FILA
// ============================================================================

export function ouvirFilaEspera(empresaId, callback) {
  try {
    const filaRef = collection(db, "fila_agendamentos");

    const qFila = query(
      filaRef,
      where("empresaId", "==", empresaId),
      orderBy("criadoEm", "desc"),
      limit(100)
    );

    return onSnapshot(
      qFila,
      (snap) => {
        const lista = snap.docs.map((d) => {
          return normalizarFila({
            id: d.id,
            ...d.data()
          });
        });

        callback(lista);
      },
      (error) => {
        console.error("❌ Listener fila espera:", error);
        callback([]);
      }
    );
  } catch (error) {
    console.error("❌ Erro ao iniciar listener fila:", error);

    callback([]);

    return () => {};
  }
}
