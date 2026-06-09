import {
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

import { db, auth, storage } from "./firebase-config.js";

const form = document.getElementById("form-servico");
const btnExcluir = document.getElementById("btn-excluir-servico");

let empresaId = null;
let servicoId = null;
let servicoEditando = null;
let isDono = false;
let isAdmin = false;
let userUid = null;
let imagemAtualUrl = "";

const ADMIN_UID = "HNIJxFjPvSO1oO9X1Gjq7negfR12";

// ===== MODAL PRONTI =====
function prontiAlert(msg, callback) {
    showProntiModal(msg, [
        { text: "OK", className: "pronti-btn pronti-btn-ok", onClick: callback }
    ]);
}

function prontiConfirm(msg, onOk, onCancel) {
    showProntiModal(msg, [
        { text: "Cancelar", className: "pronti-btn pronti-btn-cancel", onClick: onCancel },
        { text: "Confirmar", className: "pronti-btn pronti-btn-ok", onClick: onOk }
    ]);
}

function showProntiModal(msg, actions) {
    let modal = document.getElementById("pronti-modal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "pronti-modal";
        modal.className = "pronti-modal";
        modal.style.display = "none";

        modal.innerHTML = `
            <div class="pronti-modal-content">
                <span id="pronti-modal-close" class="pronti-modal-close">&times;</span>
                <div id="pronti-modal-message"></div>
                <div id="pronti-modal-actions"></div>
            </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement("style");
        style.textContent = `
            .pronti-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(44,54,80,0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }

            .pronti-modal-content {
                background: #fff;
                border-radius: 10px;
                padding: 32px;
                text-align: center;
                max-width: 350px;
                box-shadow: 0 6px 24px #0002;
                position: relative;
            }

            .pronti-modal-close {
                position: absolute;
                right: 16px;
                top: 12px;
                font-size: 22px;
                cursor: pointer;
                color: #666;
            }

            .pronti-modal-actions {
                margin-top: 28px;
                display: flex;
                gap: 16px;
                justify-content: center;
            }

            .pronti-btn {
                border: none;
                border-radius: 6px;
                padding: 9px 22px;
                font-weight: bold;
                cursor: pointer;
                font-size: 16px;
            }

            .pronti-btn-ok {
                background: #4f46e5;
                color: #fff;
            }

            .pronti-btn-cancel {
                background: #e53e3e;
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    const msgDiv = modal.querySelector("#pronti-modal-message");
    const actionsDiv = modal.querySelector("#pronti-modal-actions");

    msgDiv.innerHTML = msg;
    actionsDiv.innerHTML = "";

    actions.forEach((act) => {
        const btn = document.createElement("button");
        btn.textContent = act.text;
        btn.className = act.className;

        btn.onclick = () => {
            modal.style.display = "none";
            setTimeout(() => {
                if (act.onClick) act.onClick();
            }, 100);
        };

        actionsDiv.appendChild(btn);
    });

    modal.style.display = "flex";

    modal.querySelector("#pronti-modal-close").onclick = () => {
        modal.style.display = "none";
    };
}

// =================== Funções utilitárias ===================
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

function limparEmpresaAtiva() {
    localStorage.removeItem("empresaAtivaId");
}

async function buscaEmpresasDoUsuario(uid) {
    const q = query(collection(db, "empresarios"), where("donoId", "==", uid));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
    }));
}

function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

function usuarioEDono(empresa, uid) {
    return empresa && empresa.donoId === uid;
}

function redirecionaSeSemEmpresa() {
    prontiAlert("Atenção: Nenhuma empresa ativa selecionada. Complete seu cadastro ou selecione uma empresa.", () => {
        if (form) {
            const btnSubmit = form.querySelector('button[type="submit"]');
            if (btnSubmit) btnSubmit.disabled = true;
        }

        if (btnExcluir) btnExcluir.style.display = "none";

        window.location.href = "selecionar-empresa.html";
    });
}

function numeroInput(id) {
    const el = document.getElementById(id);
    if (!el) return NaN;

    return parseFloat(String(el.value).replace(",", "."));
}

function inteiroInput(id) {
    const el = document.getElementById(id);
    if (!el) return NaN;

    return parseInt(el.value, 10);
}

function arredondarMoeda(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

function arredondarDuracao(valor) {
    return Math.round(Number(valor) || 0);
}

function obterPrecoPorPorte(servico, porte) {
    if (!servico || !Array.isArray(servico.precos)) return {};
    return servico.precos.find((p) => p.porte === porte) || {};
}

function setValor(id, valor) {
    const el = document.getElementById(id);
    if (!el) return;

    if (valor !== undefined && valor !== null && valor !== "") {
        el.value = valor;
    } else {
        el.value = "";
    }
}

function setChecked(id, valorPadrao) {
    const el = document.getElementById(id);
    if (!el) return;

    el.checked = valorPadrao;
}

// =================== Upload da imagem ===================
async function uploadImagemServico(servicoDocId) {
    const inputImagem = document.getElementById("imagem-servico");

    if (!inputImagem || !inputImagem.files || inputImagem.files.length === 0) {
        return imagemAtualUrl || "";
    }

    const arquivo = inputImagem.files[0];

    if (!arquivo.type.startsWith("image/")) {
        throw new Error("Envie apenas arquivo de imagem.");
    }

    const caminho = `empresarios/${empresaId}/servicos/${servicoDocId}/${Date.now()}-${arquivo.name}`;
    const storageRef = ref(storage, caminho);

    await uploadBytes(storageRef, arquivo);

    return await getDownloadURL(storageRef);
}

function configurarPreviewImagem() {
    const inputImagem = document.getElementById("imagem-servico");
    const preview = document.getElementById("preview-imagem-servico");

    if (!inputImagem || !preview) return;

    inputImagem.addEventListener("change", () => {
        const file = inputImagem.files && inputImagem.files[0];

        if (!file) {
            preview.style.display = imagemAtualUrl ? "block" : "none";
            preview.src = imagemAtualUrl || "";
            return;
        }

        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
    });
}

// =================== Cálculo automático PET ===================
function calcularValoresPorPercentual() {
    const modoAuto = document.getElementById("modo-automatico");

    if (!modoAuto || !modoAuto.checked) return;

    const precoPequeno = numeroInput("preco-pequeno");
    const duracaoPequeno = inteiroInput("duracao-pequeno");

    const percentualMedio = numeroInput("percentual-medio");
    const percentualGrande = numeroInput("percentual-grande");
    const percentualGigante = numeroInput("percentual-gigante");

    if (!isNaN(precoPequeno)) {
        if (!isNaN(percentualMedio)) {
            setValor("preco-medio", arredondarMoeda(precoPequeno * (1 + percentualMedio / 100)));
        }

        if (!isNaN(percentualGrande)) {
            setValor("preco-grande", arredondarMoeda(precoPequeno * (1 + percentualGrande / 100)));
        }

        if (!isNaN(percentualGigante)) {
            setValor("preco-gigante", arredondarMoeda(precoPequeno * (1 + percentualGigante / 100)));
        }
    }

    if (!isNaN(duracaoPequeno)) {
        if (!isNaN(percentualMedio)) {
            setValor("duracao-medio", arredondarDuracao(duracaoPequeno * (1 + percentualMedio / 100)));
        }

        if (!isNaN(percentualGrande)) {
            setValor("duracao-grande", arredondarDuracao(duracaoPequeno * (1 + percentualGrande / 100)));
        }

        if (!isNaN(percentualGigante)) {
            setValor("duracao-gigante", arredondarDuracao(duracaoPequeno * (1 + percentualGigante / 100)));
        }
    }
}

function atualizarVisualModoCalculo() {
    const modoAuto = document.getElementById("modo-automatico");
    const blocoPercentuais = document.getElementById("bloco-percentuais");

    if (!modoAuto || !blocoPercentuais) return;

    blocoPercentuais.style.display = modoAuto.checked ? "block" : "none";

    if (modoAuto.checked) {
        calcularValoresPorPercentual();
    }
}

function configurarCalculoAutomaticoPet() {
    const campos = [
        "modo-automatico",
        "modo-manual",
        "preco-pequeno",
        "duracao-pequeno",
        "percentual-medio",
        "percentual-grande",
        "percentual-gigante"
    ];

    campos.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener("input", atualizarVisualModoCalculo);
        el.addEventListener("change", atualizarVisualModoCalculo);
    });

    atualizarVisualModoCalculo();
}

// =================== Preencher Formulário PET ===================
function preencherFormulario(servico) {
    document.getElementById("nome-servico").value = servico.nome || "";
    document.getElementById("descricao-servico").value = servico.descricao || "";

    const categoriaInput = document.getElementById("categoria-servico");
    if (categoriaInput) categoriaInput.value = servico.categoria || "";

    imagemAtualUrl = servico.imagemUrl || "";

    const preview = document.getElementById("preview-imagem-servico");

    if (preview && imagemAtualUrl) {
        preview.src = imagemAtualUrl;
        preview.style.display = "block";
    }

    const pequeno = obterPrecoPorPorte(servico, "pequeno");
    const medio = obterPrecoPorPorte(servico, "medio");
    const grande = obterPrecoPorPorte(servico, "grande");
    const gigante = obterPrecoPorPorte(servico, "gigante");

    setValor("preco-pequeno", pequeno.preco);
    setValor("duracao-pequeno", pequeno.duracao);

    setValor("preco-medio", medio.preco);
    setValor("duracao-medio", medio.duracao);

    setValor("preco-grande", grande.preco);
    setValor("duracao-grande", grande.duracao);

    setValor("preco-gigante", gigante.preco);
    setValor("duracao-gigante", gigante.duracao);

    const modoCalculo = servico.modoCalculo || "manual";
    const radioAuto = document.getElementById("modo-automatico");
    const radioManual = document.getElementById("modo-manual");

    if (radioAuto && radioManual) {
        radioAuto.checked = modoCalculo === "automatico";
        radioManual.checked = modoCalculo !== "automatico";
    }

    const percentuais = servico.percentuais || {};

    setValor("percentual-medio", percentuais.medio ?? 20);
    setValor("percentual-grande", percentuais.grande ?? 40);
    setValor("percentual-gigante", percentuais.gigante ?? 70);

    setChecked("visivel-vitrine", servico.visivelNaVitrine !== false);
    setChecked("permite-agendamento", servico.permiteAgendamento !== false);

    atualizarVisualModoCalculo();
}

// =================== Montar Formulário PET ===================
function montarFormularioPet() {
    const container = document.getElementById("campos-dinamicos");

    if (!container) {
        console.error("Container #campos-dinamicos não encontrado.");
        return;
    }

    container.innerHTML = `
        <style>
            .pet-section {
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 14px;
                padding: 18px;
                margin-bottom: 18px;
                box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
            }

            .pet-section h3 {
                margin: 0 0 14px 0;
                color: #1e293b;
                font-size: 1.1rem;
                font-weight: 900;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .pet-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 14px;
            }

            .pet-grid-3 {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 14px;
            }

            .pet-porte-card {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 14px;
            }

            .pet-porte-card h4 {
                margin: 0 0 12px 0;
                color: #4f46e5;
                font-size: 1rem;
                font-weight: 900;
            }

            .modo-calculo {
                display: flex;
                gap: 14px;
                flex-wrap: wrap;
                margin-top: 8px;
            }

            .modo-calculo label {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 700;
            }

            .check-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 10px;
                font-weight: 700;
                color: #334155;
            }

            .check-row input {
                width: 18px;
                height: 18px;
            }

            .preview-servico {
                width: 150px;
                height: 110px;
                object-fit: cover;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                margin-top: 10px;
                display: none;
            }

            .help-text {
                color: #64748b;
                font-size: 0.88rem;
                margin-top: 6px;
                line-height: 1.4;
            }

            @media (max-width: 780px) {
                .pet-grid,
                .pet-grid-3 {
                    grid-template-columns: 1fr;
                }
            }
        </style>

        <div class="pet-section">
            <h3>🐾 Dados do Serviço</h3>

            <div class="form-group">
                <label for="nome-servico">Nome do Serviço *</label>
                <input type="text" id="nome-servico" placeholder="Ex: Banho Completo" required>
            </div>

            <div class="form-group">
                <label for="categoria-servico">Categoria *</label>
                <input type="text" id="categoria-servico" list="lista-categorias-pet" placeholder="Ex: Banho, Tosa, Veterinário" required>

                <datalist id="lista-categorias-pet">
                    <option value="Banho">
                    <option value="Tosa">
                    <option value="Veterinário">
                    <option value="Hospedagem">
                    <option value="Creche">
                    <option value="Taxi Dog">
                    <option value="Outros">
                </datalist>

                <div class="help-text">
                    A categoria é criada manualmente e será usada para separar os serviços na tela e na vitrine.
                </div>
            </div>

            <div class="form-group">
                <label for="descricao-servico">Descrição</label>
                <textarea id="descricao-servico" rows="3" placeholder="Descreva o que está incluso no serviço."></textarea>
            </div>

            <div class="form-group">
                <label for="imagem-servico">Foto do Serviço</label>
                <input type="file" id="imagem-servico" accept="image/*">
                <img id="preview-imagem-servico" class="preview-servico" alt="Prévia da foto do serviço">
                <div class="help-text">Opcional. Se não enviar foto, a vitrine poderá usar um ícone padrão.</div>
            </div>
        </div>

        <div class="pet-section">
            <h3>⚙️ Forma de Precificação</h3>

            <div class="modo-calculo">
                <label>
                    <input type="radio" name="modo-calculo" id="modo-automatico" value="automatico" checked>
                    Automático por percentual
                </label>

                <label>
                    <input type="radio" name="modo-calculo" id="modo-manual" value="manual">
                    Manual
                </label>
            </div>

            <div class="help-text">
                No modo automático, o sistema calcula médio, grande e gigante com base no preço pequeno.
                Depois do cálculo, todos os valores continuam editáveis manualmente.
            </div>
        </div>

        <div class="pet-section" id="bloco-percentuais">
            <h3>📊 Percentuais sobre o Pequeno</h3>

            <div class="pet-grid-3">
                <div class="form-group">
                    <label for="percentual-medio">Médio +%</label>
                    <input type="number" id="percentual-medio" step="0.01" value="20">
                </div>

                <div class="form-group">
                    <label for="percentual-grande">Grande +%</label>
                    <input type="number" id="percentual-grande" step="0.01" value="40">
                </div>

                <div class="form-group">
                    <label for="percentual-gigante">Gigante +%</label>
                    <input type="number" id="percentual-gigante" step="0.01" value="70">
                </div>
            </div>
        </div>

        <div class="pet-section">
            <h3>💰 Preço e Duração por Porte</h3>

            <div class="pet-grid">
                <div class="pet-porte-card">
                    <h4>Pequeno</h4>

                    <div class="form-group">
                        <label for="preco-pequeno">Preço *</label>
                        <input type="number" id="preco-pequeno" step="0.01" min="0" required>
                    </div>

                    <div class="form-group">
                        <label for="duracao-pequeno">Duração em minutos *</label>
                        <input type="number" id="duracao-pequeno" step="1" min="1" required>
                    </div>
                </div>

                <div class="pet-porte-card">
                    <h4>Médio</h4>

                    <div class="form-group">
                        <label for="preco-medio">Preço *</label>
                        <input type="number" id="preco-medio" step="0.01" min="0" required>
                    </div>

                    <div class="form-group">
                        <label for="duracao-medio">Duração em minutos *</label>
                        <input type="number" id="duracao-medio" step="1" min="1" required>
                    </div>
                </div>

                <div class="pet-porte-card">
                    <h4>Grande</h4>

                    <div class="form-group">
                        <label for="preco-grande">Preço *</label>
                        <input type="number" id="preco-grande" step="0.01" min="0" required>
                    </div>

                    <div class="form-group">
                        <label for="duracao-grande">Duração em minutos *</label>
                        <input type="number" id="duracao-grande" step="1" min="1" required>
                    </div>
                </div>

                <div class="pet-porte-card">
                    <h4>Gigante</h4>

                    <div class="form-group">
                        <label for="preco-gigante">Preço *</label>
                        <input type="number" id="preco-gigante" step="0.01" min="0" required>
                    </div>

                    <div class="form-group">
                        <label for="duracao-gigante">Duração em minutos *</label>
                        <input type="number" id="duracao-gigante" step="1" min="1" required>
                    </div>
                </div>
            </div>
        </div>

        <div class="pet-section">
            <h3>🛒 Exibição</h3>

            <label class="check-row">
                <input type="checkbox" id="visivel-vitrine" checked>
                Exibir na vitrine
            </label>

            <label class="check-row">
                <input type="checkbox" id="permite-agendamento" checked>
                Permitir agendamento online
            </label>
        </div>
    `;

    configurarPreviewImagem();
    configurarCalculoAutomaticoPet();

    if (servicoEditando) {
        preencherFormulario(servicoEditando);
    }
}

// =================== onAuthStateChanged ===================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    userUid = user.uid;
    isAdmin = userUid === ADMIN_UID;

    empresaId = getEmpresaIdAtiva();

    if (!empresaId) {
        const empresas = await buscaEmpresasDoUsuario(userUid);

        if (empresas.length === 0) {
            prontiAlert("Você ainda não possui nenhuma empresa cadastrada. Cadastre uma empresa para continuar.", () => {
                window.location.href = "cadastro-empresa.html";
            });
            return;
        }

        if (empresas.length === 1) {
            localStorage.setItem("empresaAtivaId", empresas[0].id);
            empresaId = empresas[0].id;
        } else {
            redirecionaSeSemEmpresa();
            return;
        }
    }

    const empresaSnap = await getDoc(doc(db, "empresarios", empresaId));

    if (empresaSnap.exists()) {
        const empresa = {
            id: empresaSnap.id,
            ...empresaSnap.data()
        };

        isDono = usuarioEDono(empresa, userUid);
    } else {
        prontiAlert("Erro: empresa ativa não encontrada!", () => {
            limparEmpresaAtiva();
            window.location.href = "selecionar-empresa.html";
        });
        return;
    }

    servicoId = getIdFromUrl();

    if (servicoId) {
        const servicoSnap = await getDoc(doc(db, "empresarios", empresaId, "servicos", servicoId));

        if (servicoSnap.exists()) {
            servicoEditando = {
                id: servicoSnap.id,
                ...servicoSnap.data()
            };

            imagemAtualUrl = servicoEditando.imagemUrl || "";
        } else {
            prontiAlert("Serviço não encontrado!");
        }
    }

    montarFormularioPet();

    if (!isDono && !isAdmin && !servicoId) {
        prontiAlert("Acesso Negado: Apenas o dono da empresa ou o admin podem criar novos serviços.", () => {
            if (form) {
                const btnSubmit = form.querySelector('button[type="submit"]');
                if (btnSubmit) btnSubmit.disabled = true;
            }
        });
    }

    if (btnExcluir) {
        if (servicoEditando && (isDono || isAdmin)) {
            btnExcluir.style.display = "block";
        } else {
            btnExcluir.style.display = "none";
        }
    }
});

// =================== Eventos ===================
if (form) form.addEventListener("submit", handleFormSubmit);
if (btnExcluir) btnExcluir.addEventListener("click", handleServicoExcluir);

// =================== Submit PET ===================
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!empresaId) {
        redirecionaSeSemEmpresa();
        return;
    }

    if (!isDono && !isAdmin) {
        prontiAlert("Acesso Negado: Apenas o dono da empresa ou o admin podem salvar serviços.");
        return;
    }

    const btnSalvar = form.querySelector('button[type="submit"]');

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.textContent = "Salvando...";
    }

    try {
        const nome = document.getElementById("nome-servico").value.trim();
        const categoria = document.getElementById("categoria-servico").value.trim();
        const descricao = document.getElementById("descricao-servico").value.trim();

        const modoCalculo = document.getElementById("modo-automatico")?.checked ? "automatico" : "manual";

        const precoPequeno = numeroInput("preco-pequeno");
        const duracaoPequeno = inteiroInput("duracao-pequeno");

        const precoMedio = numeroInput("preco-medio");
        const duracaoMedio = inteiroInput("duracao-medio");

        const precoGrande = numeroInput("preco-grande");
        const duracaoGrande = inteiroInput("duracao-grande");

        const precoGigante = numeroInput("preco-gigante");
        const duracaoGigante = inteiroInput("duracao-gigante");

        const percentualMedio = numeroInput("percentual-medio");
        const percentualGrande = numeroInput("percentual-grande");
        const percentualGigante = numeroInput("percentual-gigante");

        const dadosServico = {
            nome,
            categoria,
            descricao,
            tipo: "pet",
            produto: "pronti-pet",
            visivelNaVitrine: document.getElementById("visivel-vitrine")?.checked !== false,
            permiteAgendamento: document.getElementById("permite-agendamento")?.checked !== false,
            modoCalculo,
            percentuais: {
                medio: isNaN(percentualMedio) ? 20 : percentualMedio,
                grande: isNaN(percentualGrande) ? 40 : percentualGrande,
                gigante: isNaN(percentualGigante) ? 70 : percentualGigante
            },
            precos: [
                {
                    porte: "pequeno",
                    nomePorte: "Pequeno",
                    preco: arredondarMoeda(precoPequeno),
                    duracao: arredondarDuracao(duracaoPequeno),
                    exibirNaVitrine: true,
                    permiteAgendamento: true
                },
                {
                    porte: "medio",
                    nomePorte: "Médio",
                    preco: arredondarMoeda(precoMedio),
                    duracao: arredondarDuracao(duracaoMedio),
                    exibirNaVitrine: true,
                    permiteAgendamento: true
                },
                {
                    porte: "grande",
                    nomePorte: "Grande",
                    preco: arredondarMoeda(precoGrande),
                    duracao: arredondarDuracao(duracaoGrande),
                    exibirNaVitrine: true,
                    permiteAgendamento: true
                },
                {
                    porte: "gigante",
                    nomePorte: "Gigante",
                    preco: arredondarMoeda(precoGigante),
                    duracao: arredondarDuracao(duracaoGigante),
                    exibirNaVitrine: true,
                    permiteAgendamento: true
                }
            ],
            atualizadoEm: new Date()
        };

        if (!dadosServico.nome) {
            throw new Error("Informe o nome do serviço.");
        }

        if (!dadosServico.categoria) {
            throw new Error("Informe a categoria do serviço.");
        }

        if (
            dadosServico.precos.some((p) =>
                isNaN(p.preco) ||
                p.preco < 0 ||
                isNaN(p.duracao) ||
                p.duracao <= 0
            )
        ) {
            throw new Error("Preencha corretamente preço e duração de todos os portes.");
        }

        if (servicoEditando) {
            const imagemUrl = await uploadImagemServico(servicoId);
            dadosServico.imagemUrl = imagemUrl;

            await updateDoc(doc(db, "empresarios", empresaId, "servicos", servicoId), dadosServico);
        } else {
            const novoRef = doc(collection(db, "empresarios", empresaId, "servicos"));
            const imagemUrl = await uploadImagemServico(novoRef.id);

            dadosServico.imagemUrl = imagemUrl;
            dadosServico.criadoEm = new Date();

            await setDoc(novoRef, dadosServico);
        }

        prontiAlert(servicoEditando ? "Serviço atualizado com sucesso!" : "Serviço salvo com sucesso!", () => {
            window.location.href = "servicos.html";
        });

    } catch (err) {
        prontiAlert(err.message || "Erro ao salvar serviço.");
        console.error(err);
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar Serviço";
        }
    }
}

// =================== Excluir ===================
async function handleServicoExcluir(e) {
    e.preventDefault();

    if ((!isDono && !isAdmin) || !servicoEditando) return;

    prontiConfirm(
        "Tem certeza que deseja excluir este serviço? Esta ação é permanente.",
        async () => {
            try {
                await deleteDoc(doc(db, "empresarios", empresaId, "servicos", servicoId));

                prontiAlert("Serviço excluído com sucesso.", () => {
                    window.location.href = "servicos.html";
                });

            } catch (err) {
                prontiAlert(`Ocorreu um erro ao excluir o serviço: ${err.message}`);
                console.error(err);
            }
        },
        () => {}
    );
}
