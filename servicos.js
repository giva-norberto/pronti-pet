// ======================================================================
// ARQUIVO: servicos.js
// VERSÃO REVISADA - COMPATÍVEL COM PRONTI NORMAL + PRONTI PET
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

// --- Elementos do DOM ---
const listaServicosDiv = document.getElementById("lista-servicos");
const btnAddServico = document.querySelector(".btn-new");
const btnPromocoes = document.getElementById("btnPromocoes");

// --- Estado ---
let empresaId = null;
let isDono = false;

// ======================================================================
// CSS extra seguro para cards PET
// ======================================================================
function aplicarEstiloServicosPet() {
    if (document.getElementById("style-servicos-pet-js")) return;

    const style = document.createElement("style");
    style.id = "style-servicos-pet-js";

    style.textContent = `
        .servico-card-pet {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 18px;
            align-items: stretch;
        }

        .servico-imagem-box {
            width: 150px;
            min-height: 135px;
            border-radius: 14px;
            overflow: hidden;
            background: linear-gradient(135deg, #eef2ff, #f8fafc);
            border: 1px solid #e0e7ff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #4f46e5;
            font-size: 2.4rem;
        }

        .servico-imagem-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .servico-conteudo {
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        .servico-precos-pet {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #eef2ff;
        }

        .porte-preco-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 10px;
            min-width: 0;
        }

        .porte-nome {
            font-size: 0.82rem;
            font-weight: 900;
            color: #4f46e5;
            margin-bottom: 4px;
        }

        .porte-valor {
            font-size: 1rem;
            font-weight: 900;
            color: #16a34a;
            white-space: nowrap;
        }

        .porte-tempo {
            font-size: 0.78rem;
            font-weight: 700;
            color: #64748b;
            margin-top: 2px;
        }

        .servico-footer-pet {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 10px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #eef2ff;
        }

        @media (max-width: 900px) {
            .servico-card-pet {
                grid-template-columns: 1fr;
                gap: 12px;
            }

            .servico-imagem-box {
                width: 100%;
                height: 170px;
                min-height: 170px;
            }

            .servico-precos-pet {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }

            .servico-footer-pet {
                justify-content: stretch;
            }

            .servico-footer-pet .btn-acao {
                flex: 1;
            }
        }

        @media (max-width: 430px) {
            .servico-precos-pet {
                grid-template-columns: 1fr;
            }

            .servico-imagem-box {
                height: 150px;
                min-height: 150px;
            }
        }
    `;

    document.head.appendChild(style);
}

// ======================================================================
// Empresa ativa
// ======================================================================
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

// ======================================================================
// Inicialização
// ======================================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        aplicarEstiloServicosPet();

        empresaId = getEmpresaIdAtiva();

        if (!empresaId) {
            if (listaServicosDiv) {
                listaServicosDiv.innerHTML = '<p style="color:red;">Nenhuma empresa ativa selecionada.</p>';
            }
            return;
        }

        const empresaRef = doc(db, "empresarios", empresaId);
        const empresaSnap = await getDoc(empresaRef);

        if (empresaSnap.exists()) {
            const adminUID = "HNIJxFjPvSO1oO9X1Gjq7negfR12";
            isDono = empresaSnap.data().donoId === user.uid || user.uid === adminUID;
        }

        if (btnAddServico) {
            btnAddServico.style.display = isDono ? "inline-flex" : "none";
        }

        if (btnPromocoes) {
            btnPromocoes.style.display = isDono ? "inline-flex" : "none";
        }

        iniciarListenerDeServicos();

    } catch (error) {
        console.error("Erro durante a inicialização:", error);

        if (listaServicosDiv) {
            listaServicosDiv.innerHTML = '<p style="color:red;">Ocorreu um erro crítico ao carregar a página.</p>';
        }
    }
});

// ======================================================================
// Listener em tempo real
// ======================================================================
function iniciarListenerDeServicos() {
    if (!empresaId) return;

    if (listaServicosDiv) {
        listaServicosDiv.innerHTML = '<p class="empty-message">Carregando serviços...</p>';
    }

    const servicosCol = collection(db, "empresarios", empresaId, "servicos");
    const q = query(servicosCol);

    onSnapshot(q, (snapshot) => {
        const servicos = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        renderizarServicos(servicos);

    }, (error) => {
        console.error("Erro ao carregar serviços em tempo real:", error);

        if (listaServicosDiv) {
            listaServicosDiv.innerHTML = '<p style="color:red;">Erro ao carregar os serviços.</p>';
        }
    });
}

// ======================================================================
// Renderização
// ======================================================================
function renderizarServicos(servicos) {
    if (!listaServicosDiv) return;

    if (!servicos || servicos.length === 0) {
        listaServicosDiv.innerHTML = `
            <p class="empty-message">
                Nenhum serviço cadastrado.
                ${isDono ? 'Clique em "Adicionar Serviço" para começar.' : ""}
            </p>
        `;
        return;
    }

    const agrupados = {};

    servicos.forEach((servico) => {
        const categoria = servico.categoria && servico.categoria.trim()
            ? servico.categoria.trim()
            : "Outros";

        if (!agrupados[categoria]) agrupados[categoria] = [];
        agrupados[categoria].push(servico);
    });

    const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
    );

    listaServicosDiv.innerHTML = categoriasOrdenadas.map((categoria) => {
        const servicosCategoria = agrupados[categoria].sort((a, b) =>
            (a.nome || "").localeCompare(b.nome || "", "pt-BR")
        );

        return `
            <div class="categoria-bloco">
                <h2 class="categoria-titulo">${sanitizeHTML(categoria)}</h2>
                ${servicosCategoria.map((servico) => renderizarCardServico(servico)).join("")}
            </div>
        `;
    }).join("");
}

// ======================================================================
// Card individual
// ======================================================================
function renderizarCardServico(servico) {
    const ehPet = Array.isArray(servico.precos) && servico.precos.length > 0;

    if (ehPet) {
        return renderizarCardPet(servico);
    }

    return renderizarCardPadrao(servico);
}

// ======================================================================
// Card PET com imagem e preço por porte
// ======================================================================
function renderizarCardPet(servico) {
    const imagemHtml = servico.imagemUrl
        ? `<img src="${sanitizeAttribute(servico.imagemUrl)}" alt="${sanitizeAttribute(servico.nome || "Serviço")}">`
        : `<i class="fas fa-paw"></i>`;

    return `
        <div class="servico-card servico-card-pet">
            <div class="servico-imagem-box">
                ${imagemHtml}
            </div>

            <div class="servico-conteudo">
                <div class="servico-header">
                    <h3 class="servico-titulo">${sanitizeHTML(servico.nome || "Serviço sem nome")}</h3>
                </div>

                ${servico.descricao ? `
                    <p class="servico-descricao">${sanitizeHTML(servico.descricao)}</p>
                ` : ""}

                <div class="servico-precos-pet">
                    ${renderizarPrecosPorPorte(servico.precos)}
                </div>

                <div class="servico-footer-pet">
                    <div class="servico-acoes">
                        ${isDono ? `<button class="btn-acao btn-editar" data-id="${servico.id}">Editar</button>` : ""}
                        ${isDono ? `<button class="btn-acao btn-excluir" data-id="${servico.id}">Excluir</button>` : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ======================================================================
// Card padrão antigo do Pronti
// ======================================================================
function renderizarCardPadrao(servico) {
    return `
        <div class="servico-card">
            <div class="servico-header">
                <h3 class="servico-titulo">${sanitizeHTML(servico.nome || "Serviço sem nome")}</h3>
            </div>

            ${servico.descricao ? `
                <p class="servico-descricao">${sanitizeHTML(servico.descricao)}</p>
            ` : ""}

            <div class="servico-footer">
                <div>
                    <span class="servico-preco">${formatarPreco(servico.preco)}</span>
                    <span class="servico-duracao"> • ${Number(servico.duracao || 0)} min</span>
                </div>

                <div class="servico-acoes">
                    ${isDono ? `<button class="btn-acao btn-editar" data-id="${servico.id}">Editar</button>` : ""}
                    ${isDono ? `<button class="btn-acao btn-excluir" data-id="${servico.id}">Excluir</button>` : ""}
                </div>
            </div>
        </div>
    `;
}

// ======================================================================
// Preços por porte
// ======================================================================
function renderizarPrecosPorPorte(precos) {
    const ordem = ["pequeno", "medio", "grande", "gigante"];

    const nomes = {
        pequeno: "Pequeno",
        medio: "Médio",
        grande: "Grande",
        gigante: "Gigante"
    };

    return ordem.map((porte) => {
        const item = precos.find((p) => p.porte === porte) || {};

        return `
            <div class="porte-preco-card">
                <div class="porte-nome">${nomes[porte]}</div>
                <div class="porte-valor">${formatarPreco(item.preco)}</div>
                <div class="porte-tempo">${Number(item.duracao || 0)} min</div>
            </div>
        `;
    }).join("");
}

// ======================================================================
// Excluir serviço
// ======================================================================
async function excluirServico(servicoId) {
    if (!isDono) {
        await showAlert("Acesso Negado", "Apenas o dono pode excluir serviços.");
        return;
    }

    const confirmado = window.confirm("Tem certeza que deseja excluir este serviço? Esta ação não pode ser desfeita.");
    if (!confirmado) return;

    try {
        const servicoRef = doc(db, "empresarios", empresaId, "servicos", servicoId);
        await deleteDoc(servicoRef);
        console.log("Serviço excluído com sucesso!");

    } catch (error) {
        console.error("Erro ao excluir serviço:", error);
        await showAlert("Erro", "Ocorreu um erro ao excluir o serviço: " + error.message);
    }
}

// ======================================================================
// Utilitários
// ======================================================================
function formatarPreco(preco) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(preco || 0));
}

function sanitizeHTML(str) {
    if (!str) return "";
    const temp = document.createElement("div");
    temp.textContent = String(str);
    return temp.innerHTML;
}

function sanitizeAttribute(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ======================================================================
// Eventos
// ======================================================================
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
            excluirServico(id);
        }
    });
}

if (btnAddServico) {
    btnAddServico.addEventListener("click", (e) => {
        e.preventDefault();

        if (!isDono) {
            showAlert("Acesso Negado", "Apenas o dono pode adicionar serviços.");
            return;
        }

        window.location.href = "novo-servico.html";
    });
}

if (btnPromocoes) {
    btnPromocoes.addEventListener("click", (e) => {
        e.preventDefault();

        if (!isDono) {
            showAlert("Acesso Negado", "Apenas o dono pode gerenciar promoções.");
            return;
        }

        window.location.href = "promocoes.html";
    });
}
