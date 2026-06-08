import {
  ofertarVagaParaFila,
  confirmarOfertaFila,
  recusarOfertaFila,
  ouvirOfertasFila,
  ouvirFilaEspera
} from "./filaInteligenteEngine.js";

let empresaIdAtual = null;
let unsubscribeOfertas = null;
let unsubscribeFila = null;
let painelFilaJaInicializado = false;

export function iniciarPainelFilaInteligente(empresaId) {
  empresaIdAtual = empresaId;

  if (unsubscribeOfertas) unsubscribeOfertas();
  if (unsubscribeFila) unsubscribeFila();

  unsubscribeOfertas = ouvirOfertasFila(empresaId, renderizarOfertas);
  unsubscribeFila = ouvirFilaEspera(empresaId, renderizarFila);

  if (!painelFilaJaInicializado) {
    bindAcoesPainel();
    painelFilaJaInicializado = true;
  }
}

function bindAcoesPainel() {
  document.addEventListener("click", async (e) => {
    const btnOferta = e.target.closest("[data-ofertar-vaga]");
    const btnConfirmar = e.target.closest("[data-confirmar-oferta]");
    const btnRecusar = e.target.closest("[data-recusar-oferta]");

    if (btnOferta) {
      const vaga = {
        data: btnOferta.dataset.data,
        horario: btnOferta.dataset.horario,
        profissionalId: btnOferta.dataset.profissionalId || null,
        profissionalNome: btnOferta.dataset.profissionalNome || "",
        servicoId: btnOferta.dataset.servicoId,
        servicoNome: btnOferta.dataset.servicoNome || ""
      };

      btnOferta.disabled = true;

      try {
        const res = await ofertarVagaParaFila(empresaIdAtual, vaga);

        if (!res.ok) {
          alert(`Não foi possível ofertar: ${res.motivo}`);
        }
      } catch (error) {
        console.error("Erro ao ofertar vaga:", error);
        alert("Erro ao ofertar vaga.");
      } finally {
        btnOferta.disabled = false;
      }

      return;
    }

    if (btnConfirmar) {
      const ofertaId = btnConfirmar.dataset.confirmarOferta;

      btnConfirmar.disabled = true;

      try {
        const res = await confirmarOfertaFila(empresaIdAtual, ofertaId);

        if (!res.ok) {
          alert(`Falha ao confirmar: ${res.motivo}`);
        } else {
          alert(
            res.horario && res.clienteNome
              ? `Agendamento confirmado para ${res.clienteNome} às ${res.horario}`
              : "Agendamento confirmado!"
          );
        }
      } catch (error) {
        console.error("Erro ao confirmar oferta:", error);
        alert("Erro ao confirmar oferta.");
      } finally {
        btnConfirmar.disabled = false;
      }

      return;
    }

    if (btnRecusar) {
      const ofertaId = btnRecusar.dataset.recusarOferta;

      btnRecusar.disabled = true;

      try {
        const res = await recusarOfertaFila(empresaIdAtual, ofertaId);

        if (!res.ok) {
          alert(`Falha ao recusar: ${res.motivo}`);
        }
      } catch (error) {
        console.error("Erro ao recusar oferta:", error);
        alert("Erro ao recusar oferta.");
      } finally {
        btnRecusar.disabled = false;
      }

      return;
    }
  });
}

function formatarStatus(status) {
  const mapa = {
    aguardando: "Aguardando",
    oferta_enviada: "Oferta enviada",
    confirmado: "Confirmado",
    recusado: "Recusado",
    cancelado: "Cancelado",
    expirado: "Expirado",

    pendente: "Pendente",
    confirmada: "Confirmada",
    recusada: "Recusada",
    expirada: "Expirada",

    fila: "Aguardando",
    ofertado: "Oferta enviada",
    atendido: "Confirmado",
    aceita: "Confirmada"
  };

  return mapa[status] || status || "-";
}

function obterClasseStatus(status) {
  const mapa = {
    fila: "aguardando",
    aguardando: "aguardando",

    ofertado: "oferta_enviada",
    oferta_enviada: "oferta_enviada",

    atendido: "confirmado",
    aceita: "confirmada",
    confirmado: "confirmado",
    confirmada: "confirmada",

    recusado: "recusado",
    recusada: "recusada",

    expirado: "expirado",
    expirada: "expirada",

    cancelado: "cancelado",
    cancelada: "cancelado",

    pendente: "pendente"
  };

  return mapa[status] || "desconhecido";
}

function renderizarOfertas(lista) {
  const el = document.getElementById("listaOfertasFila");
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div class="estado-vazio">Nenhuma oferta ainda.</div>`;
    return;
  }

  el.innerHTML = lista
    .map((item) => {
      const classeStatus = obterClasseStatus(item.status);

      return `
        <div class="card-fila">
          <div class="card-fila-topo">
            <strong>${item.clienteNome || "Cliente"}</strong>
            <span class="badge-status badge-${classeStatus}">
              ${formatarStatus(item.status)}
            </span>
          </div>

          <div class="card-fila-info">
            <div><b>Serviço:</b> ${item.servicoNome || "-"}</div>
            <div><b>Profissional:</b> ${item.profissionalNome || "-"}</div>
            <div><b>Data:</b> ${item.data || "-"}</div>
            <div><b>Horário:</b> ${item.horario || "-"}</div>
          </div>

          ${
            item.status === "pendente"
              ? `
                <div class="card-fila-acoes">
                  <button data-confirmar-oferta="${item.id}" class="btn-primario">
                    Confirmar
                  </button>
                  <button data-recusar-oferta="${item.id}" class="btn-secundario">
                    Recusar
                  </button>
                </div>
              `
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function renderizarFila(lista) {
  const el = document.getElementById("listaFilaEspera");
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div class="estado-vazio">Ninguém na fila no momento.</div>`;
    return;
  }

  el.innerHTML = lista
    .map((item) => {
      const classeStatus = obterClasseStatus(item.status);

      return `
        <div class="card-fila">
          <div class="card-fila-topo">
            <strong>${item.clienteNome || "Cliente"}</strong>
            <span class="badge-status badge-${classeStatus}">
              ${formatarStatus(item.status)}
            </span>
          </div>

          <div class="card-fila-info">
            <div><b>Serviço:</b> ${item.servicoNome || "-"}</div>
            <div><b>Profissional:</b> ${
              item.profissionalNome || "Qualquer um"
            }</div>
            <div><b>Data desejada:</b> ${
              item.dataDesejada || item.dataFila || "-"
            }</div>
            <div><b>Horários:</b> ${
              (item.horariosAceitos || []).join(", ") || "-"
            }</div>
          </div>
        </div>
      `;
    })
    .join("");
}
