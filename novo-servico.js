import {
    doc, getDoc, updateDoc, deleteDoc,
    collection, query, where, getDocs, addDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

const form = document.getElementById('form-servico');
const btnExcluir = document.getElementById('btn-excluir-servico');

let empresaId = null;
let servicoId = null;
let servicoEditando = null;
let isDono = false;
let isAdmin = false;
let userUid = null;

const ADMIN_UID = "BX6Q7HrVMrcCBqe72r7K76EBPkX2";

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
    let modal = document.getElementById('pronti-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pronti-modal';
        modal.className = 'pronti-modal';
        modal.style.display = 'none';

        modal.innerHTML = `
          <div class="pronti-modal-content">
            <span id="pronti-modal-close" class="pronti-modal-close">&times;</span>
            <div id="pronti-modal-message"></div>
            <div id="pronti-modal-actions"></div>
          </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.textContent = `
.pronti-modal {
    position:fixed;
    top:0;
    left:0;
    right:0;
    bottom:0;
    background:rgba(44,54,80,0.25);
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:9999;
}

.pronti-modal-content {
    background:#fff;
    border-radius:10px;
    padding:32px;
    text-align:center;
    max-width:350px;
    box-shadow:0 6px 24px #0002;
    position:relative;
}

.pronti-modal-close {
    position:absolute;
    right:16px;
    top:12px;
    font-size:22px;
    cursor:pointer;
    color:#666;
}

.pronti-modal-actions {
    margin-top:28px;
    display:flex;
    gap:16px;
    justify-content:center;
}

.pronti-btn {
    border:none;
    border-radius:6px;
    padding:9px 22px;
    font-weight:bold;
    cursor:pointer;
    font-size:16px;
}

.pronti-btn-ok {
    background:#4f46e5;
    color:#fff;
}

.pronti-btn-cancel {
    background:#e53e3e;
    color:#fff;
}
        `;
        document.head.appendChild(style);
    }

    const msgDiv = modal.querySelector('#pronti-modal-message');
    const actionsDiv = modal.querySelector('#pronti-modal-actions');

    msgDiv.innerHTML = msg;
    actionsDiv.innerHTML = '';

    actions.forEach(act => {
        const btn = document.createElement('button');
        btn.textContent = act.text;
        btn.className = act.className;

        btn.onclick = () => {
            modal.style.display = 'none';
            setTimeout(() => {
                if (act.onClick) act.onClick();
            }, 100);
        };

        actionsDiv.appendChild(btn);
    });

    modal.style.display = 'flex';

    modal.querySelector('#pronti-modal-close').onclick = () => {
        modal.style.display = 'none';
    };
}

// =================== UTILITÁRIOS ===================
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

function limparEmpresaAtiva() {
    localStorage.removeItem("empresaAtivaId");
}

async function buscaEmpresasDoUsuario(uid) {
    const q = query(collection(db, "empresarios"), where("donoId", "==", uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function usuarioEDono(empresa, uid) {
    return empresa && empresa.donoId === uid;
}

function redirecionaSeSemEmpresa() {
    prontiAlert("Atenção: Nenhum pet shop ativo selecionado. Complete o cadastro ou selecione um pet shop.", () => {
        if (form) form.querySelector('button[type="submit"]').disabled = true;
        if (btnExcluir) btnExcluir.style.display = 'none';
        window.location.href = 'selecionar-empresa.html';
    });
}

// =================== FORMULÁRIO PET ===================
function montarFormularioPet() {
    const container = document.getElementById('campos-dinamicos');

    if (!container) {
        prontiAlert("Erro: container de campos dinâmicos não encontrado.");
        return;
    }

    container.innerHTML = `
        <div class="form-group">
            <label for="nome-servico">Nome do Serviço Pet</label>
            <input type="text" id="nome-servico" placeholder="Ex: Banho, Tosa, Banho e Tosa" required>
        </div>

        <div class="form-group">
            <label for="descricao-servico">Descrição</label>
            <textarea id="descricao-servico" rows="3" placeholder="Ex: Banho completo com shampoo, secagem e escovação"></textarea>
        </div>

        <div class="form-group">
            <label for="categoria-servico">Categoria</label>
            <select id="categoria-servico" required>
                <option value="">Selecione uma categoria</option>
                <option value="Banho">Banho</option>
                <option value="Tosa">Tosa</option>
                <option value="Banho e Tosa">Banho e Tosa</option>
                <option value="Hidratação">Hidratação</option>
                <option value="Corte de Unhas">Corte de Unhas</option>
                <option value="Pacotes">Pacotes</option>
                <option value="Outros">Outros</option>
            </select>
        </div>

        <h3 style="margin: 18px 0 14px; color:#1e1b4b;">
            Preço e duração por porte
        </h3>

        <div class="form-group">
            <label for="preco-pequeno">Preço - Porte Pequeno</label>
            <input type="number" id="preco-pequeno" step="0.01" min="0" placeholder="Ex: 40.00" required>
        </div>

        <div class="form-group">
            <label for="duracao-pequeno">Duração - Porte Pequeno (minutos)</label>
            <input type="number" id="duracao-pequeno" step="1" min="1" placeholder="Ex: 30" required>
        </div>

        <div class="form-group">
            <label for="preco-medio">Preço - Porte Médio</label>
            <input type="number" id="preco-medio" step="0.01" min="0" placeholder="Ex: 55.00" required>
        </div>

        <div class="form-group">
            <label for="duracao-medio">Duração - Porte Médio (minutos)</label>
            <input type="number" id="duracao-medio" step="1" min="1" placeholder="Ex: 45" required>
        </div>

        <div class="form-group">
            <label for="preco-grande">Preço - Porte Grande</label>
            <input type="number" id="preco-grande" step="0.01" min="0" placeholder="Ex: 75.00" required>
        </div>

        <div class="form-group">
            <label for="duracao-grande">Duração - Porte Grande (minutos)</label>
            <input type="number" id="duracao-grande" step="1" min="1" placeholder="Ex: 60" required>
        </div>
    `;

    if (servicoEditando) preencherFormularioPet(servicoEditando);
}

function preencherFormularioPet(servico) {
    if (!servico) return;

    document.getElementById('nome-servico').value = servico.nome || '';
    document.getElementById('descricao-servico').value = servico.descricao || '';
    document.getElementById('categoria-servico').value = servico.categoria || '';

    const precos = Array.isArray(servico.precos) ? servico.precos : [];

    const pequeno = precos.find(p => p.porte === "pequeno") || {};
    const medio = precos.find(p => p.porte === "medio") || {};
    const grande = precos.find(p => p.porte === "grande") || {};

    document.getElementById('preco-pequeno').value = pequeno.preco ?? '';
    document.getElementById('duracao-pequeno').value = pequeno.duracao ?? '';

    document.getElementById('preco-medio').value = medio.preco ?? '';
    document.getElementById('duracao-medio').value = medio.duracao ?? '';

    document.getElementById('preco-grande').value = grande.preco ?? '';
    document.getElementById('duracao-grande').value = grande.duracao ?? '';
}

// =================== AUTH ===================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    userUid = user.uid;
    isAdmin = userUid === ADMIN_UID;
    empresaId = getEmpresaIdAtiva();

    if (!empresaId) {
        const empresas = await buscaEmpresasDoUsuario(userUid);

        if (empresas.length === 0) {
            prontiAlert("Você ainda não possui nenhum pet shop cadastrado. Cadastre um pet shop para continuar.", () => {
                window.location.href = 'cadastro-empresa.html';
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
        const empresa = { id: empresaSnap.id, ...empresaSnap.data() };
        isDono = usuarioEDono(empresa, userUid);
    } else {
        prontiAlert("Erro: pet shop ativo não encontrado!", () => {
            limparEmpresaAtiva();
            window.location.href = 'selecionar-empresa.html';
        });
        return;
    }

    servicoId = getIdFromUrl();

    if (servicoId) {
        const servicoSnap = await getDoc(doc(db, "empresarios", empresaId, "servicos", servicoId));

        if (servicoSnap.exists()) {
            servicoEditando = { id: servicoSnap.id, ...servicoSnap.data() };
        } else {
            prontiAlert("Serviço pet não encontrado!");
        }
    }

    montarFormularioPet();

    if (!isDono && !isAdmin && !servicoId) {
        prontiAlert("Acesso negado: apenas o dono do pet shop ou o admin podem criar novos serviços.", () => {
            if (form) form.querySelector('button[type="submit"]').disabled = true;
        });
    }

    if (btnExcluir) {
        btnExcluir.style.display = servicoEditando && (isDono || isAdmin) ? 'block' : 'none';
    }
});

// =================== EVENTOS ===================
if (form) form.addEventListener('submit', handleFormSubmit);
if (btnExcluir) btnExcluir.addEventListener('click', handleServicoExcluir);

// =================== SALVAR ===================
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!empresaId) {
        redirecionaSeSemEmpresa();
        return;
    }

    const btnSalvar = form.querySelector('button[type="submit"]');
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    try {
        const nome = document.getElementById('nome-servico').value.trim();
        const descricao = document.getElementById('descricao-servico').value.trim();
        const categoria = document.getElementById('categoria-servico').value.trim();

        const precoPequeno = parseFloat(document.getElementById('preco-pequeno').value);
        const duracaoPequeno = parseInt(document.getElementById('duracao-pequeno').value, 10);

        const precoMedio = parseFloat(document.getElementById('preco-medio').value);
        const duracaoMedio = parseInt(document.getElementById('duracao-medio').value, 10);

        const precoGrande = parseFloat(document.getElementById('preco-grande').value);
        const duracaoGrande = parseInt(document.getElementById('duracao-grande').value, 10);

        const dadosServico = {
            nome,
            descricao,
            categoria,
            visivelNaVitrine: true,
            precos: [
                {
                    porte: "pequeno",
                    nomePorte: "Pequeno",
                    preco: precoPequeno,
                    duracao: duracaoPequeno
                },
                {
                    porte: "medio",
                    nomePorte: "Médio",
                    preco: precoMedio,
                    duracao: duracaoMedio
                },
                {
                    porte: "grande",
                    nomePorte: "Grande",
                    preco: precoGrande,
                    duracao: duracaoGrande
                }
            ]
        };

        if (
            !nome ||
            !categoria ||
            dadosServico.precos.some(p =>
                isNaN(p.preco) ||
                isNaN(p.duracao) ||
                p.preco < 0 ||
                p.duracao <= 0
            )
        ) {
            throw new Error("Preencha corretamente o nome, categoria, preço e duração dos 3 portes.");
        }

        if (servicoEditando) {
            await updateDoc(doc(db, "empresarios", empresaId, "servicos", servicoId), dadosServico);
        } else {
            await addDoc(collection(db, "empresarios", empresaId, "servicos"), dadosServico);
        }

        prontiAlert(servicoEditando ? "Serviço pet atualizado com sucesso!" : "Serviço pet salvo com sucesso!", () => {
            window.location.href = 'servicos.html';
        });

    } catch (err) {
        prontiAlert(err.message || "Erro ao salvar serviço pet.");
        console.error(err);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Serviço";
    }
}

// =================== EXCLUIR ===================
async function handleServicoExcluir(e) {
    e.preventDefault();

    if ((!isDono && !isAdmin) || !servicoEditando) return;

    prontiConfirm(
        "Tem certeza que deseja excluir este serviço pet? Esta ação é permanente.",
        async () => {
            try {
                await deleteDoc(doc(db, "empresarios", empresaId, "servicos", servicoId));

                prontiAlert("Serviço pet excluído com sucesso.", () => {
                    window.location.href = 'servicos.html';
                });

            } catch (err) {
                prontiAlert(`Ocorreu um erro ao excluir o serviço pet: ${err.message}`);
                console.error(err);
            }
        },
        () => {}
    );
}
