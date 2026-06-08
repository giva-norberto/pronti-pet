// ======================================================================
// ARQUIVO: servicos.js — PRONTI PET
// Tela exclusiva para Serviços Pet com preços por porte
// ======================================================================

import {
  collection,
  doc,
  getDoc,
  deleteDoc,
  onSnapshot,
  query
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { db, auth } from "./firebase-config.js";
import { showAlert } from "./vitrini-utils.js";

// --- Elementos ---
const listaServicosDiv = document.getElementById("lista-servicos");
const btnAddServico = document.querySelector(".btn-new");
const btnPromocoes = document.getElementById("btnPromocoes");

// --- Estado ---
let empresaId = null;
let isDono = false;
let unsubscribeServicosPet = null;

const adminUID = "BX6Q7HrVMrcCBqe72r7K76EBPkX2";

function getEmpresaIdAtiva() {
  return localStorage.getItem("empresaAtivaId") || null;
}

// --- Inicialização ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    empresaId = getEmpresaIdAtiva();

    if (!empresaId) {
      if (listaServicosDiv) {
        listaServicosDiv.innerHTML =
          '<p style="color:red;">Nenhum pet shop ativo selecionado.</p>';
      }
      return;
    }

    const empresaRef = doc(db, "empresarios", empresaId);
    const empresaSnap = await getDoc(empresaRef);

    if (empresaSnap.exists()) {
      isDono = empresaSnap.data().donoId === user.uid || user.uid === adminUID;
    } else {
      isDono = user.uid === adminUID;
    }

    if (btnAddServico) {
      btnAddServico.style.display = isDono ? "inline-flex" : "none";
    }

    if (btnPromocoes) {
      btnPromocoes.style.display = isDono ? "inline-flex" : "none";
    }

    iniciarListenerDeServicosPet();

  } catch (error) {
    console.error("Erro ao inicializar serviços pet:", error);

    if (listaServicosDiv) {
      listaServicosDiv.innerHTML =
        '<p style="color:red;">Erro ao carregar a tela de serviços pet.</p>';
    }
  }
});

// --- Listener em tempo real ---
function iniciarListenerDeServicosPet() {
  if (!empresaId) return;

  if (listaServicosDiv) {
    listaServicosDiv.innerHTML = "<p>Carregando serviços pet...</p>";
  }

  const servicosPetCol = collection(db, "empresarios", empresaId, "servicos_pet");
  const q = query(servicosPetCol);

  if (unsubscribeServicosPet) unsubscribeServicosPet();

  unsubscribeServicosPet = onSnapshot(
    q,
    (snapshot) => {
      const servicos = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      renderizarServicosPet(servicos);
    },
    (error) => {
      console.error("Erro ao carregar serviços pet:", error);

      if (listaServicosDiv) {
        listaServicosDiv.innerHTML =
          '<p style="color:red;">Erro ao carregar os serviços pet.</p>';
      }
    }
  );
}

// --- Renderização ---
function renderizarServicosPet(servicos) {
  if (!listaServicosDiv) return;

  if (!servicos || servicos.length === 0) {
    listaServicosDiv.innerHTML = `
      <p style="color:#fff; font-weight:700;">
        Nenhum serviço pet cadastrado.
        ${isDono ? 'Clique em "Novo Serviço Pet" para começar.' : ""}
      </p>
    `;
    return;
  }

  const agrupados = {};

  servicos.forEach((servico) => {
    const categoria =
      servico.categoria && servico.categoria.trim()
        ? servico.categoria.trim()
        : "Outros";

    if (!agrupados[categoria]) agrupados[categoria] = [];
    agrupados[categoria].push(servico);
  });

  const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  listaServicosDiv.innerHTML = categoriasOrdenadas
    .map((categoria) => {
      const servicosCategoria = agrupados[categoria].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "", "pt-BR")
      );

      return `
        <div class="categoria-bloco">
          <h2 class="categoria-titulo">${sanitizeHTML(categoria)}</h2>
          ${servicosCategoria.map(renderServicoCardPet).join("")}
        </div>
      `;
    })
    .join("");
}

function renderServicoCardPet(servico) {
  const nome = sanitizeHTML(servico.nome || "Serviço pet");
  const descricao = sanitizeHTML(servico.descricao || "");
  const precos = Array.isArray(servico.precos) ? servico.precos : [];

  return `
    <div class="servico-card" data-id="${servico.id}">
      <div class="servico-header">
        <h3 class="servico-titulo">🐶 ${nome}</h3>
      </div>

      ${
        descricao
          ? `<p class="servico-descricao">${descricao}</p>`
          : `<p class="servico-descricao">Sem descrição cadastrada.</p>`
      }

      <div class="servico-footer" style="align-items:flex-start; gap:20px;">
        <div style="flex:1;">
          <strong style="display:block; margin-bottom:8px; color:#0f172a;">
            Preços por porte:
          </strong>

          ${
            precos.length > 0
              ? precos
                  .map((p) => {
                    const porte = sanitizeHTML(p.porte || "Porte");
                    const preco = formatarPreco(p.preco);
                    const duracao = p.duracao ? `${p.duracao} min` : "sem duração";

                    return `
                      <div style="margin:5px 0; color:#334155;">
                        <span style="font-weight:800;">${porte}:</span>
                        <span class="servico-preco">${preco}</span>
                        <span class="servico-duracao"> • ${duracao}</span>
                      </div>
                    `;
                  })
                  .join("")
              : `<div style="color:#64748b;">Nenhum preço por porte cadastrado.</div>`
          }
        </div>

        ${
          isDono
            ? `
              <div class="servico-acoes">
                <button class="btn-acao btn-editar" data-id="${servico.id}">
                  Editar
                </button>
                <button class="btn-acao btn-excluir" data-id="${servico.id}">
                  Excluir
                </button>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

// --- Excluir ---
async function excluirServicoPet(servicoId) {
  if (!isDono) {
    await showAlert("Acesso negado", "Apenas o dono pode excluir serviços pet.");
    return;
  }

  const confirmado = window.confirm(
    "Tem certeza que deseja excluir este serviço pet? Esta ação não pode ser desfeita."
  );

  if (!confirmado) return;

  try {
    const servicoRef = doc(
      db,
      "empresarios",
      empresaId,
      "servicos_pet",
      servicoId
    );

    await deleteDoc(servicoRef);
    await showAlert("Sucesso", "Serviço pet excluído com sucesso.");

  } catch (error) {
    console.error("Erro ao excluir serviço pet:", error);
    await showAlert(
      "Erro",
      "Não foi possível excluir o serviço pet: " + (error.message || error)
    );
  }
}

// --- Utilitários ---
function formatarPreco(preco) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(preco || 0));
}

function sanitizeHTML(str) {
  if (!str) return "";
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

// --- Eventos ---
if (listaServicosDiv) {
  listaServicosDiv.addEventListener("click", function (e) {
    const target = e.target.closest(".btn-acao");
    if (!target) return;

    const id = target.dataset.id;
    if (!id) return;

    if (target.classList.contains("btn-editar")) {
      window.location.href = `novo-servico.html?id=${id}`;
    }

    if (target.classList.contains("btn-excluir")) {
      excluirServicoPet(id);
    }
  });
}

if (btnAddServico) {
  btnAddServico.addEventListener("click", (e) => {
    e.preventDefault();

    if (!isDono) {
      showAlert("Acesso negado", "Apenas o dono pode adicionar serviços pet.");
      return;
    }

    window.location.href = "novo-servico.html";
  });
}

if (btnPromocoes) {
  btnPromocoes.addEventListener("click", (e) => {
    e.preventDefault();

    if (!isDono) {
      showAlert("Acesso negado", "Apenas o dono pode gerenciar preços especiais.");
      return;
    }

    window.location.href = "promocoes.html";
  });
}
