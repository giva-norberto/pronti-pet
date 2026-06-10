// ======================================================================
// ARQUIVO: servicos.js
// VERSÃO REVISADA - CARD COMPACTO + PORTES DINÂMICOS
// COMPATÍVEL COM PRONTI NORMAL + PRONTI PET
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

const listaServicosDiv = document.getElementById("lista-servicos");
const btnAddServico = document.querySelector(".btn-new");
const btnPromocoes = document.getElementById("btnPromocoes");

let empresaId = null;
let isDono = false;

// ======================================================================
// CSS DOS CARDS PET - COMPACTO
// ======================================================================
function aplicarEstiloServicosPet() {
    if (document.getElementById("style-servicos-pet-js")) return;

    const style = document.createElement("style");
    style.id = "style-servicos-pet-js";

    style.textContent = `
        .servico-card-pet {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 14px;
            align-items: start;
            padding: 14px !important;
        }

        .servico-imagem-box {
            width: 120px;
            height: 120px;
            min-height: 120px;
            border-radius: 12px;
            overflow: hidden;
            background: linear-gradient(135deg, #eef2ff, #f8fafc);
            border: 1px solid #e0e7ff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #4f46e5;
            font-size: 2rem;
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

        .servico-card-pet .servico-header {
            margin-bottom: 4px;
        }

        .servico-card-pet .servico-titulo {
            font-size: 1.15rem;
            line-height: 1.2;
        }

        .servico-card-pet .servico-descricao {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin: 5px 0 8px !important;
            font-size: 0.9rem;
            line-height: 1.35;
        }

        .servico-precos-pet {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            margin-top: 6px;
            padding-top: 9px;
            border-top: 1px solid #eef2ff;
        }

        .porte-preco-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 999px;
            padding: 6px 10px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            min-width: auto;
            white-space: nowrap;
        }

        .porte-nome {
            font-size: 0.75rem;
            font-weight: 900;
            color: #4f46e5;
        }

        .porte-valor {
            font-size: 0.85rem;
            font-weight: 900;
            color: #16a34a;
        }

        .porte-tempo {
            font-size: 0.72rem;
            font-weight: 700;
            color: #64748b;
        }

        .servico-footer-pet {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin-top: 9px;
            padding-top: 9px;
            border-top: 1px solid #eef2ff;
        }

        .servico-footer-pet .btn-acao {
            padding: 7px 10px;
            font-size: 0.82rem;
        }

        @media (max-width: 900px) {
            .servico-card-pet {
                grid-template-columns: 92px 1fr;
                gap: 10px;
                padding: 12px !important;
            }

            .servico-imagem-box {
                width: 92px;
                height: 92px;
                min-height: 92px;
                border-radius: 10px;
            }

            .servico-card-pet .servico-titulo {
                font-size: 1rem;
            }

            .servico-card-pet .servico-descricao {
                font-size: 0.84rem;
                margin: 4px 0 6px !important;
            }

            .servico-precos-pet {
                gap: 5px;
                padding-top: 7px;
                margin-top: 5px;
            }

            .porte-preco-card {
                padding: 5px 8px;
                gap: 4px;
            }

            .porte-nome {
                font-size: 0.7rem;
            }

            .porte-valor {
                font-size: 0.78rem;
            }

            .porte-tempo {
                font-size: 0.68rem;
            }

            .servico-footer-pet {
                justify-content: flex-start;
                margin-top: 7px;
                padding-top: 7px;
            }
        }

        @media (max-width: 430px) {
            .servico-card-pet {
                grid-template-columns: 1fr;
            }

            .servico-imagem-box {
                width: 100%;
                height: 145px;
                min-height: 145px;
            }
        }
    `;

    document.head.appendChild(style);
}

// ======================================================================
// EMPRESA ATIVA
// ======================================================================
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

// ======================================================================
// INICIALIZAÇÃO
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
// LISTENER EM TEMPO REAL
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
// RENDERIZAÇÃO
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
// CARD INDIVIDUAL
// ======================================================================
function renderizarCardServico(servico) {
    const ehPet = Array.isArray(servico.precos) && servico.precos.length > 0;

    if (ehPet) {
        return renderizarCardPet(servico);
    }

    return renderizarCardPadrao(servico);
}

// ======================================================================
// CARD PET
// ======================================================================
function renderizarCardPet(servico) {
    const imagemHtml = servico.imagemUrl
        ? `<img src="${sanitizeAttribute(servico.imagemUrl)}" alt="${sanitizeAttribute(servico.nome || "Serviço")}">`
        : `<i class="fas fa-paw"></i>`;

    const precosHtml = renderizarPrecosPorPorte(servico.precos);

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

                ${precosHtml ? `
                    <div class="servico-precos-pet">
                        ${precosHtml}
                    </div>
                ` : ""}

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
// CARD PADRÃO ANTIGO
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
// PREÇOS POR PORTE - DINÂMICO
// Só mostra porte com preço maior que 0 e duração maior que 0.
// ======================================================================
function renderizarPrecosPorPorte(precos) {
    if (!Array.isArray(precos)) return "";

    const ordem = ["pequeno", "medio", "grande", "gigante"];

    const nomes = {
        pequeno: "Peq.",
        medio: "Méd.",
        grande: "Grd.",
        gigante: "Gig."
    };

    const itensValidos = ordem
        .map((porte) => {
            const item = precos.find((p) => p.porte === porte);

            if (!item) return null;

            const preco = Number(item.preco || 0);
            const duracao = Number(item.duracao || 0);

            if (isNaN(preco) || isNaN(duracao)) return null;
            if (preco <= 0 || duracao <= 0) return null;

            return {
                porte,
                nome: nomes[porte],
                preco,
                duracao
            };
        })
        .filter(Boolean);

    if (itensValidos.length === 0) {
        return "";
    }

    return itensValidos.map((item) => `
        <div class="porte-preco-card">
            <span class="porte-nome">${item.nome}</span>
            <span class="porte-valor">${formatarPreco(item.preco)}</span>
            <span class="porte-tempo">${item.duracao}min</span>
        </div>
    `).join("");
}

// ======================================================================
// EXCLUIR SERVIÇO
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
// UTILITÁRIOS
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
// EVENTOS
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
