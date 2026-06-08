import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const ADMIN_UID = "BX6Q7HrVMrcCBqe72r7K76EBPkX2";
const conteudoDiv = document.getElementById('conteudo-admin');

let empresasCache = [];
let planosCache = [];
let telaAtual = "empresas";

// ====================================================
// RENDER
// =====================================================
function render(html) {
    if (conteudoDiv) conteudoDiv.innerHTML = html;
}

// =====================================================
// TROCA DE TELAS
// =====================================================
async function abrirEmpresas() {
    telaAtual = "empresas";
    await carregarEmpresas();
    renderEmpresas();
}

async function abrirPlanos() {
    telaAtual = "planos";
    await listarPlanos();
}

// =====================================================
// EMPRESAS
// =====================================================
async function carregarEmpresas() {
    const snap = await getDocs(collection(db, "empresarios"));

    empresasCache = await Promise.all(snap.docs.map(async d => {
        const empresa = { uid: d.id, ...d.data() };

        const profSnap = await getDocs(
            collection(db, "empresarios", empresa.uid, "profissionais")
        );

        empresa.funcionarios = profSnap.docs.map(p => p.data());
        return empresa;
    }));
}

function renderEmpresas() {
    let html = `
        <div style="margin-bottom:20px; display: flex; gap: 10px;">
            <button onclick="abrirEmpresas()" style="font-weight:bold; padding: 10px 20px; cursor: pointer;">Empresas</button>
            <button onclick="abrirPlanos()" style="padding: 10px 20px; cursor: pointer; background-color: #4f46e5; color: white; border: none; border-radius: 5px;">Planos Pronti</button>
        </div>

        <h2>Gestão de Empresas</h2>
    `;

    if (empresasCache.length === 0) {
        html += `<div style="color:#888;">Nenhuma empresa encontrada.</div>`;
    } else {
        html += empresasCache.map(e => {
            const total = e.funcionarios?.length || 0;
            const lic = e.usuariosLicenciados || total;

            return `
                <div style="margin-bottom:15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
                    <strong>${e.nome || e.email}</strong> (ID: ${e.uid})<br>
                    <span style="color: #666;">Funcionários Cadastrados: ${total}</span><br>

                    <div style="margin-top: 10px;">
                        Licenças Permitidas:
                        <input type="number" id="license-input-${e.uid}" value="${lic}" style="width: 60px; padding: 5px;">
                        <button onclick="salvarLicencas('${e.uid}')" style="padding: 5px 10px; cursor: pointer;">Salvar</button>
                        <button onclick="toggleBloqueio('${e.uid}', ${!e.bloqueado}, this)" style="padding: 5px 10px; cursor: pointer; background: ${e.bloqueado ? '#10b981' : '#ef4444'}; color: white; border: none; border-radius: 3px;">
                            ${e.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    render(html);
}

// =====================================================
// INICIALIZAR PLANOS PADRÃO
// =====================================================
async function inicializarPlanos() {
    const planosInicial = {
        1: { preco: 49.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=ca1b0887e74842659651f9763f203f13" },
        2: { preco: 79.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=642a8aead0404c9aae87499dd7795aac" },
        3: { preco: 129.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=7877711c561b463bb7245ad1ad24e2cb" },
        5: { preco: 179.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=31393e2a0c774b51ab5398220e380c35" },
        7: { preco: 239.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=e20885f0964546abbd5bcca897830917" },
        8: { preco: 259.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=24ff030e895d49b793a90d91f1169d9b" },
        10: { preco: 299.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=876be42a1f424af3b5fadcb4566a7b9a" },
        12: { preco: 349.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=9699f8c182f74e9e8ac80e27bee7f78f" },
        15: { preco: 399.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=2abb49f271d54839b02da960943dedb4" },
        17: { preco: 449.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=cedbcdf5f64c4cf1864936b9091cbc75" },
        20: { preco: 499.90, linkMP: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=cd27c2649a1f4262813cb2e44cf6842f" },
    };

    try {
        for (const [limite, dados] of Object.entries(planosInicial)) {
            await setDoc(doc(db, "configPlanos", limite), dados);
        }
        console.log("Planos inicializados com sucesso!");
    } catch (error) {
        console.error("Erro ao inicializar planos:", error);
    }
}

// =====================================================
// PLANOS (GESTÃO COMPLETA)
// =====================================================
async function listarPlanos() {
    try {
        const snap = await getDocs(collection(db, "configPlanos"));

        planosCache = snap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        let html = `
            <div style="margin-bottom:20px; display: flex; gap: 10px;">
                <button onclick="abrirEmpresas()" style="padding: 10px 20px; cursor: pointer;">Empresas</button>
                <button onclick="abrirPlanos()" style="font-weight:bold; padding: 10px 20px; cursor: pointer; background-color: #4f46e5; color: white; border: none; border-radius: 5px;">Planos Pronti</button>
            </div>

            <h2>Gestão de Planos Pronti</h2>
            <p style="color: #666; margin-bottom: 20px;">Altere os valores e links abaixo. As mudanças refletem instantaneamente na tela de pagamento do cliente.</p>

            <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 10px; align-items: center;">
                <strong>Aumento em Massa:</strong>
                <input type="number" id="percentual" placeholder="% aumento" style="width: 100px; padding: 8px;">
                <button onclick="aplicarAumento()" style="padding: 8px 15px; background: #000; color: #fff; border: none; border-radius: 5px; cursor: pointer;">Aplicar em Todos</button>
            </div>
        `;

        if (planosCache.length === 0) {
            html += `<div style="color:#888;">Nenhum plano cadastrado. Criando estrutura inicial...</div>`;
            await inicializarPlanos();
            await listarPlanos();
            return;
        } else {
            html += `
                <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <thead>
                        <tr style="background: #4f46e5; color: white; text-align: left;">
                            <th style="padding: 12px;">Plano (Limite)</th>
                            <th style="padding: 12px;">Preço (R$)</th>
                            <th style="padding: 12px;">Link Mercado Pago</th>
                            <th style="padding: 12px;">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            html += planosCache.map(p => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px;"><b>Até ${p.id}</b> funcionários</td>
                    <td style="padding: 12px;">
                        <input type="number" step="0.01" id="preco-${p.id}" value="${p.preco}" style="width: 80px; padding: 5px;">
                    </td>
                    <td style="padding: 12px;">
                        <input type="text" id="link-${p.id}" value="${p.linkMP || ''}" style="width: 100%; max-width: 300px; padding: 5px; font-size: 12px;" placeholder="https://www.mercadopago...">
                    </td>
                    <td style="padding: 12px;">
                        <button onclick="salvarPlano('${p.id}')" style="padding: 5px 15px; background: #10b981; color: white; border: none; border-radius: 3px; cursor: pointer;">Salvar</button>
                    </td>
                </tr>
            `).join('');

            html += `</tbody></table>`;
        }

        render(html);
    } catch (error) {
        console.error("Erro ao listar planos:", error);
        render(`<div style="color: red;">Erro ao carregar planos: ${error.message}</div>`);
    }
}

// =====================================================
// AÇÕES
// =====================================================
async function salvarLicencas(empresaId) {
    const input = document.getElementById(`license-input-${empresaId}`);
    const valor = parseInt(input.value);

    await updateDoc(doc(db, "empresarios", empresaId), {
        usuariosLicenciados: valor
    });

    alert("Licenças atualizadas com sucesso!");
}

async function salvarPlano(planoId) {
    const precoInput = document.getElementById(`preco-${planoId}`);
    const linkInput = document.getElementById(`link-${planoId}`);

    const novoPreco = parseFloat(precoInput.value);
    const novoLink = linkInput.value;

    try {
        await updateDoc(doc(db, "configPlanos", planoId), {
            preco: novoPreco,
            linkMP: novoLink,
            updatedAt: new Date()
        });

        alert("Plano atualizado com sucesso!");
        await listarPlanos();
    } catch (error) {
        console.error("Erro ao salvar plano:", error);
        alert("Erro ao salvar alterações.");
    }
}

async function aplicarAumento() {
    const percentualInput = document.getElementById("percentual");
    const percentual = parseFloat(percentualInput.value);

    if (isNaN(percentual)) {
        alert("Insira um valor percentual válido.");
        return;
    }

    if (!confirm(`Deseja aplicar um aumento de ${percentual}% em todos os planos?`)) return;

    try {
        for (const plano of planosCache) {
            const novoPreco = plano.preco * (1 + percentual / 100);
            await updateDoc(doc(db, "configPlanos", plano.id), {
                preco: parseFloat(novoPreco.toFixed(2)),
                updatedAt: new Date()
            });
        }

        alert("Aumento aplicado em todos os planos!");
        await listarPlanos();
    } catch (error) {
        console.error("Erro ao aplicar aumento:", error);
        alert("Erro ao processar aumento em massa.");
    }
}

async function toggleBloqueio(empresaId, novoStatus, button) {
    const acao = novoStatus ? 'bloquear' : 'desbloquear';
    if (!confirm(`Tem certeza que deseja ${acao} esta empresa?`)) return;

    const originalText = button.textContent;
    button.textContent = 'Aguarde...';
    button.disabled = true;

    try {
        await updateDoc(doc(db, "empresarios", empresaId), {
            bloqueado: novoStatus
        });

        await carregarEmpresas();
        renderEmpresas();

    } catch (e) {
        alert("Erro ao atualizar status.");
    }

    button.textContent = originalText;
    button.disabled = false;
}

// =====================================================
// LOGIN E INICIALIZAÇÃO
// =====================================================
function inicializarPainelAdmin() {
    onAuthStateChanged(auth, async (user) => {
        if (user && user.uid === ADMIN_UID) {
            await carregarEmpresas();
            renderEmpresas();
        } else {
            render("<div style='padding: 20px; text-align: center; color: red;'>Acesso negado. Apenas administradores podem ver esta página.</div>");
        }
    });
}

inicializarPainelAdmin();

// =====================================================
// EXPOSIÇÃO GLOBAL PARA O HTML
// =====================================================
window.salvarPlano = salvarPlano;
window.aplicarAumento = aplicarAumento;
window.salvarLicencas = salvarLicencas;
window.abrirEmpresas = abrirEmpresas;
window.abrirPlanos = abrirPlanos;
window.toggleBloqueio = toggleBloqueio;

