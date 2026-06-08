// ======================================================================
// ARQUIVO: promocoes.js (VERSÃO REVISADA - MOSTRA TODOS OS SERVIÇOS SEM FALHAR)
// ======================================================================

import { collection, doc, addDoc, onSnapshot, query, getDocs, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// --- Mapeamento de Elementos do DOM ---
const formPromocao = document.getElementById('form-promocao');
const checkTodosServicos = document.getElementById('todos-servicos');
const servicosContainer = document.getElementById('servicos-checkbox-container');
const diasContainer = document.getElementById('dias-semana-container');
const listaPromocoesDiv = document.getElementById('lista-promocoes');
const promoNomeInput = document.getElementById('promo-nome');
const tipoDescontoSelect = document.getElementById('tipo-desconto');
const valorDescontoInput = document.getElementById('valor-desconto');

// --- Variáveis de Estado ---
let empresaId = localStorage.getItem("empresaAtivaId") || null;
let todosOsServicos = []; // Vamos guardar os serviços aqui para reutilizar

// --- Inicialização ---
onAuthStateChanged(auth, (user) => {
    if (user && empresaId) {
        carregarServicosParaCheckboxes();
        adicionarListenersDeInteracao();
        iniciarListenerDePromocoes();
    } else {
        console.error("Usuário não autenticado ou empresaId não encontrado.");
        window.location.href = 'login.html';
    }
});

/**
 * 1. Carrega os serviços da empresa e cria os checkboxes dinamicamente.
 * Garante que TODOS os serviços da empresa aparecem,
 * sem filtros invisíveis e sem limite de quantidade.
 */
async function carregarServicosParaCheckboxes() {
    try {
        const servicosRef = collection(db, "empresarios", empresaId, "servicos");
        const snapshot = await getDocs(servicosRef);

        servicosContainer.innerHTML = ''; // Limpa a mensagem "Carregando..."

        if (snapshot.empty) {
            servicosContainer.innerHTML = '<p style="color: #666;">Nenhum serviço cadastrado para selecionar.</p>';
            todosOsServicos = [];
            return;
        }

        todosOsServicos = snapshot.docs.map(doc => {
            const data = doc.data();
            // Garante que cada serviço tem id, nome, e não filtra nenhum campo
            return {
                id: doc.id,
                nome: data.nome || '(sem nome)',
                ...data
            };
        });

        // Log para depuração: veja se TODOS aparecem
        console.log("Todos os serviços carregados:", todosOsServicos);

        // Renderiza TODOS os serviços
        todosOsServicos.forEach(servico => {
            const itemHTML = `
                <div class="checkbox-item">
                    <input type="checkbox" class="servico-individual" value="${servico.id}" id="servico-${servico.id}">
                    <label for="servico-${servico.id}">${servico.nome}</label>
                </div>
            `;
            servicosContainer.insertAdjacentHTML('beforeend', itemHTML);
        });
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        servicosContainer.innerHTML = '<p style="color: red;">Falha ao carregar serviços.</p>';
        todosOsServicos = [];
    }
}

/**
 * 2. Adiciona a lógica de interação entre o checkbox "TODOS" e os individuais.
 */
function adicionarListenersDeInteracao() {
    if (!checkTodosServicos) return;

    checkTodosServicos.addEventListener('change', () => {
        const servicosIndividuais = servicosContainer.querySelectorAll('.servico-individual');
        servicosIndividuais.forEach(check => {
            check.disabled = checkTodosServicos.checked;
            if (checkTodosServicos.checked) {
                check.checked = false;
            }
        });
    });

    servicosContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('servico-individual') && e.target.checked) {
            if (checkTodosServicos) {
                checkTodosServicos.checked = false;
                const servicosIndividuais = servicosContainer.querySelectorAll('.servico-individual');
                servicosIndividuais.forEach(check => {
                    check.disabled = false;
                });
            }
        }
    });
}

/**
 * 3. Ouve as promoções salvas no Firestore e as exibe na tela.
 */
function iniciarListenerDePromocoes() {
    const promocoesRef = collection(db, "empresarios", empresaId, "precos_especiais");
    const q = query(promocoesRef);

    onSnapshot(q, (snapshot) => {
        const promocoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarPromocoes(promocoes);
    }, (error) => {
        console.error("Erro ao ouvir promoções:", error);
        listaPromocoesDiv.innerHTML = `<p style="color: red;">Erro ao carregar promoções.</p>`;
    });
}

/**
 * 4. Renderiza os cards das promoções na parte inferior da página.
 * Garante que todos os serviços apareçam pelo nome (ou avisa se removido).
 */
function renderizarPromocoes(promocoes) {
    if (promocoes.length === 0) {
        listaPromocoesDiv.innerHTML = "<p>Nenhuma promoção cadastrada ainda.</p>";
        return;
    }

    listaPromocoesDiv.innerHTML = promocoes.map(promo => {
        const nomeServicos = promo.servicoIds && Array.isArray(promo.servicoIds)
            ? promo.servicoIds.map(id => {
                  const serv = todosOsServicos.find(s => s.id === id);
                  return serv ? serv.nome : '<span style="color:red">Serviço removido</span>';
              }).join(', ')
            : '<strong>Todos os serviços</strong>';

        const diasSemana = promo.diasSemana?.map(formatarDiaSemana).join(', ') || 'Nenhum dia';
        const desconto = formatarDesconto(promo);

        return `
            <div class="promocao-card" style="border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
                <h4>${promo.nome || 'Promoção sem nome'}</h4>
                <p><strong>Serviços:</strong> ${nomeServicos}</p>
                <p><strong>Dias:</strong> ${diasSemana}</p>
                <p><strong>Desconto:</strong> ${desconto}</p>
                <button class="btn-excluir-promo" data-id="${promo.id}" style="color: red; cursor: pointer;">Excluir</button>
            </div>
        `;
    }).join('');
}

/**
 * 5. Gerencia o envio do formulário para salvar a promoção.
 */
formPromocao.addEventListener('submit', async (e) => {
    e.preventDefault();

    let servicosSelecionados = null;
    // Captura todos os serviços marcados, mas só se "TODOS" não estiver marcado
    if (!checkTodosServicos.checked) {
        servicosSelecionados = Array.from(servicosContainer.querySelectorAll('.servico-individual:checked')).map(cb => cb.value);
        if (servicosSelecionados.length === 0) {
            alert("Erro: Selecione 'TODOS os serviços' ou pelo menos um serviço individual.");
            return;
        }
    }

    const diasSelecionados = Array.from(diasContainer.querySelectorAll('input[name="dia-semana"]:checked')).map(cb => parseInt(cb.value, 10));
    if (diasSelecionados.length === 0) {
        alert("Erro: Selecione pelo menos um dia da semana.");
        return;
    }

    const novaPromocao = {
        nome: promoNomeInput.value,
        servicoIds: servicosSelecionados,
        diasSemana: diasSelecionados,
        tipoDesconto: tipoDescontoSelect.value,
        valor: parseFloat(valorDescontoInput.value),
        ativo: true,
        criadoEm: Timestamp.now()
    };

    try {
        const promocoesRef = collection(db, "empresarios", empresaId, "precos_especiais");
        await addDoc(promocoesRef, novaPromocao);
        formPromocao.reset();
        // Re-habilita os checkboxes de serviço após o reset
        servicosContainer.querySelectorAll('.servico-individual').forEach(check => check.disabled = false);
        alert("Promoção salva com sucesso!");
    } catch (error) {
        console.error("Erro ao salvar promoção:", error);
        alert("Não foi possível salvar a promoção. Tente novamente.");
    }
});

/**
 * 6. Adiciona funcionalidade de exclusão aos botões.
 */
listaPromocoesDiv.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-excluir-promo')) {
        const promoId = e.target.dataset.id;
        if (confirm("Tem certeza que deseja excluir esta promoção?")) {
            try {
                const promoRef = doc(db, "empresarios", empresaId, "precos_especiais", promoId);
                await deleteDoc(promoRef);
                // A tela irá atualizar automaticamente por causa do onSnapshot
            } catch (error) {
                console.error("Erro ao excluir promoção:", error);
                alert("Falha ao excluir a promoção.");
            }
        }
    }
});

// --- Funções Auxiliares ---
function formatarDiaSemana(dia) {
    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return dias[dia] || '';
}

function formatarDesconto(promo) {
    if (promo.tipoDesconto === 'percentual') {
        return `${promo.valor}% de desconto`;
    }
    return `R$ ${promo.valor.toFixed(2)} de desconto`;
}
