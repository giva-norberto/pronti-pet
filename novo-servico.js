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
let tipoEmpresa = null;

const ADMIN_UID = "BX6Q7HrVMrcCBqe72r7K76EBPkX2";

// ===== MODAL PRONTI =====
function prontiAlert(msg, callback) {
    showProntiModal(msg, [{ text: "OK", className: "pronti-btn pronti-btn-ok", onClick: callback }]);
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
.pronti-modal { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(44,54,80,0.25); display:flex; align-items:center; justify-content:center; z-index:9999; }
.pronti-modal-content { background:#fff; border-radius:10px; padding:32px; text-align:center; max-width:350px; box-shadow:0 6px 24px #0002; position:relative; }
.pronti-modal-close { position:absolute; right:16px; top:12px; font-size:22px; cursor:pointer; color:#666;}
.pronti-modal-actions { margin-top:28px; display:flex; gap:16px; justify-content:center; }
.pronti-btn { border:none; border-radius:6px; padding:9px 22px; font-weight:bold; cursor:pointer; font-size:16px;}
.pronti-btn-ok { background:#4f46e5; color:#fff; }
.pronti-btn-cancel { background:#e53e3e; color:#fff; }
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
            setTimeout(() => { if (act.onClick) act.onClick(); }, 100);
        };
        actionsDiv.appendChild(btn);
    });
    modal.style.display = 'flex';
    modal.querySelector('#pronti-modal-close').onclick = () => { modal.style.display = 'none'; };
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
    prontiAlert("Atenção: Nenhuma empresa ativa selecionada. Complete seu cadastro ou selecione uma empresa.", () => {
        if(form) form.querySelector('button[type="submit"]').disabled = true;
        if(btnExcluir) btnExcluir.style.display = 'none';
        window.location.href = 'selecionar-empresa.html';
    });
}

// =================== Preencher Formulário Dinâmico ===================
function preencherFormulario(servico) {
    if (tipoEmpresa === "pets") {
        document.getElementById('nome-servico').value = servico.nome || '';
        document.getElementById('descricao-servico').value = servico.descricao || '';

        // Preencher campos de cada porte
        if (servico.precos) {
            const pequeno = servico.precos.find(p => p.porte === "pequeno") || {};
            const medio = servico.precos.find(p => p.porte === "medio") || {};
            const grande = servico.precos.find(p => p.porte === "grande") || {};
            document.getElementById('preco-pequeno').value = pequeno.preco || '';
            document.getElementById('duracao-pequeno').value = pequeno.duracao || '';
            document.getElementById('preco-medio').value = medio.preco || '';
            document.getElementById('duracao-medio').value = medio.duracao || '';
            document.getElementById('preco-grande').value = grande.preco || '';
            document.getElementById('duracao-grande').value = grande.duracao || '';
        }

        // Categoria opcional
        const categoriaInput = document.getElementById('categoria-servico');
        if (categoriaInput) categoriaInput.value = servico.categoria || '';
    } else {
        document.getElementById('nome-servico').value = servico.nome || '';
        document.getElementById('descricao-servico').value = servico.descricao || '';
        document.getElementById('preco-servico').value = servico.preco !== undefined ? servico.preco : '';
        document.getElementById('duracao-servico').value = servico.duracao !== undefined ? servico.duracao : '';
        const categoriaInput = document.getElementById('categoria-servico');
        if (categoriaInput) categoriaInput.value = servico.categoria || '';
    }
}

// =================== Montar Formulário Dinâmico ===================
function montarFormularioPorTipo() {
    const container = document.getElementById('campos-dinamicos');
    container.innerHTML = '';

    if (tipoEmpresa === "pets") {
        container.innerHTML = `
            <div class="form-group">
                <label for="nome-servico">Nome do Serviço</label>
                <input type="text" id="nome-servico" required>
            </div>
            <div class="form-group">
                <label for="descricao-servico">Descrição</label>
                <textarea id="descricao-servico" rows="3"></textarea>
            </div>

            <h3>Preço e Duração por Porte</h3>

            <div class="form-group">
                <label for="preco-pequeno">Preço (Pequeno)</label>
                <input type="number" id="preco-pequeno" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="duracao-pequeno">Duração (minutos - Pequeno)</label>
                <input type="number" id="duracao-pequeno" step="1" required>
            </div>

            <div class="form-group">
                <label for="preco-medio">Preço (Médio)</label>
                <input type="number" id="preco-medio" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="duracao-medio">Duração (minutos - Médio)</label>
                <input type="number" id="duracao-medio" step="1" required>
            </div>

            <div class="form-group">
                <label for="preco-grande">Preço (Grande)</label>
                <input type="number" id="preco-grande" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="duracao-grande">Duração (minutos - Grande)</label>
                <input type="number" id="duracao-grande" step="1" required>
            </div>

            <div class="form-group">
                <label for="categoria-servico">Categoria (opcional)</label>
                <input type="text" id="categoria-servico">
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="form-group">
                <label for="nome-servico">Nome do Serviço</label>
                <input type="text" id="nome-servico" required>
            </div>
            <div class="form-group">
                <label for="descricao-servico">Descrição</label>
                <textarea id="descricao-servico" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label for="preco-servico">Preço</label>
                <input type="number" id="preco-servico" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="duracao-servico">Duração (minutos)</label>
                <input type="number" id="duracao-servico" step="1" required>
            </div>
            <div class="form-group">
                <label for="categoria-servico">Categoria</label>
                <input type="text" id="categoria-servico">
            </div>
        `;
    }

    if (servicoEditando) preencherFormulario(servicoEditando);
}

// =================== onAuthStateChanged ===================
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
            prontiAlert("Você ainda não possui nenhuma empresa cadastrada. Cadastre uma empresa para continuar.", () => {
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
        tipoEmpresa = empresa.tipoEmpresa;
        isDono = usuarioEDono(empresa, userUid);
    } else {
        prontiAlert("Erro: empresa ativa não encontrada!", () => {
            limparEmpresaAtiva();
            window.location.href = 'selecionar-empresa.html';
        });
        return;
    }

    montarFormularioPorTipo();

    servicoId = getIdFromUrl();
    if (servicoId) {
        const servicoSnap = await getDoc(doc(db, "empresarios", empresaId, "servicos", servicoId));
        if (servicoSnap.exists()) {
            servicoEditando = { id: servicoSnap.id, ...servicoSnap.data() };
            preencherFormulario(servicoEditando);
        } else {
            prontiAlert("Serviço não encontrado!");
        }
    }

    if (!isDono && !isAdmin && !servicoId) {
        prontiAlert("Acesso Negado: Apenas o dono da empresa ou o admin podem criar novos serviços.", () => {
            if(form) form.querySelector('button[type="submit"]').disabled = true;
        });
    }

    if (btnExcluir) {
        if (servicoEditando && (isDono || isAdmin)) {
            btnExcluir.style.display = 'block';
        } else {
            btnExcluir.style.display = 'none';
        }
    }
});

// =================== Eventos ===================
if (form) form.addEventListener('submit', handleFormSubmit);
if (btnExcluir) btnExcluir.addEventListener('click', handleServicoExcluir);

// =================== Submit ===================
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
        let dadosServico = {};

        if (tipoEmpresa === "pets") {
            dadosServico = {
                nome: document.getElementById('nome-servico').value.trim(),
                descricao: document.getElementById('descricao-servico').value.trim(),
                tipo: "pets",
                visivelNaVitrine: true,
                precos: [
                    { 
                        porte: "pequeno", 
                        preco: parseFloat(document.getElementById('preco-pequeno').value),
                        duracao: parseInt(document.getElementById('duracao-pequeno').value, 10)
                    },
                    { 
                        porte: "medio", 
                        preco: parseFloat(document.getElementById('preco-medio').value),
                        duracao: parseInt(document.getElementById('duracao-medio').value, 10)
                    },
                    { 
                        porte: "grande", 
                        preco: parseFloat(document.getElementById('preco-grande').value),
                        duracao: parseInt(document.getElementById('duracao-grande').value, 10)
                    }
                ]
            };

            // Categoria opcional
            const categoriaInput = document.getElementById('categoria-servico');
            if (categoriaInput && categoriaInput.value.trim() !== '') {
                dadosServico.categoria = categoriaInput.value.trim();
            }

            // Validação obrigatória
            if (!dadosServico.nome || dadosServico.precos.some(p => isNaN(p.preco) || isNaN(p.duracao))) {
                throw new Error("Preencha todos os campos obrigatórios corretamente.");
            }
        } else {
            const categoriaInput = document.getElementById('categoria-servico');
            dadosServico = {
                nome: document.getElementById('nome-servico').value.trim(),
                descricao: document.getElementById('descricao-servico').value.trim(),
                preco: parseFloat(document.getElementById('preco-servico').value),
                duracao: parseInt(document.getElementById('duracao-servico').value, 10),
                visivelNaVitrine: true
            };
            if (categoriaInput && categoriaInput.value.trim() !== '') {
                dadosServico.categoria = categoriaInput.value.trim();
            }
            if (!dadosServico.nome || isNaN(dadosServico.preco) || isNaN(dadosServico.duracao)) {
                throw new Error("Preencha todos os campos obrigatórios corretamente.");
            }
        }

        if (servicoEditando) {
            await updateDoc(doc(db, "empresarios", empresaId, "servicos", servicoId), dadosServico);
        } else {
            await addDoc(collection(db, "empresarios", empresaId, "servicos"), dadosServico);
        }

        prontiAlert(servicoEditando ? "Serviço atualizado com sucesso!" : "Serviço salvo com sucesso!", () => {
            window.location.href = 'servicos.html';
        });

    } catch (err) {
        prontiAlert(err.message || "Erro ao salvar serviço.");
        console.error(err);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Serviço";
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
                    window.location.href = 'servicos.html';
                });
            } catch (err) {
                prontiAlert(`Ocorreu um erro ao excluir o serviço: ${err.message}`);
                console.error(err);
            }
        },
        () => {}
    );
}
