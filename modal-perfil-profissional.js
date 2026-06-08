// Módulo para gerenciar o modal de edição do perfil de um profissional (serviços e horários).

import { doc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- ELEMENTOS DO DOM ---
const modalEl = document.getElementById('modal-perfil-profissional');
const nomeEl = document.getElementById('perfil-nome-profissional');
const servicosContainerEl = document.getElementById('servicos-lista');
const horariosContainerEl = document.getElementById('horarios-lista');
const btnCancelar = document.getElementById('btn-cancelar-perfil');
const btnSalvar = document.getElementById('btn-salvar-perfil');

// --- ESTADO INTERNO DO MÓDULO ---
let estado = {
    db: null,
    empresaId: null,
    profissionalAtual: null,
    todosOsServicos: [],
};

// --- FUNÇÕES PRIVADAS (Renderização) ---

/** Renderiza a lista de todos os serviços, marcando os que o profissional já possui. */
function _renderizarServicos() {
    servicosContainerEl.innerHTML = '';
    if (estado.todosOsServicos.length === 0) {
        servicosContainerEl.innerHTML = `<div class="aviso-modal">Nenhum serviço cadastrado na empresa.</div>`;
        return;
    }

    // Pega os IDs dos serviços que o profissional já tem
    const servicosSelecionadosIds = new Set(
        (estado.profissionalAtual.servicos || [])
            .map(s => typeof s === "object" ? (s.id || s._id) : s) // Suporta objeto ou string
    );

    estado.todosOsServicos.forEach(servico => {
        const div = document.createElement("div");
        div.className = "servico-item";
        div.dataset.servicoId = servico.id;
        div.innerHTML = `
            <div class="servico-nome">${servico.nome}</div>
            <div class="servico-preco">R$ ${parseFloat(servico.preco || 0).toFixed(2)}</div>
        `;
        
        if (servicosSelecionadosIds.has(servico.id)) {
            div.classList.add('selected');
        }

        div.addEventListener('click', () => div.classList.toggle('selected'));
        servicosContainerEl.appendChild(div);
    });
}

/** Renderiza os inputs de horário para cada dia da semana. */
function _renderizarHorarios() {
    horariosContainerEl.innerHTML = '';
    const diasSemana = [
        { key: 'segunda', nome: 'Segunda' }, { key: 'terca', nome: 'Terça' },
        { key: 'quarta', nome: 'Quarta' }, { key: 'quinta', nome: 'Quinta' },
        { key: 'sexta', nome: 'Sexta' }, { key: 'sabado', nome: 'Sábado' },
        { key: 'domingo', nome: 'Domingo' }
    ];

    const horariosBase = { inicio: '09:00', fim: '18:00', ativo: false };
    const horariosAtuais = estado.profissionalAtual.horarios || {};

    diasSemana.forEach(dia => {
        const configDia = horariosAtuais[dia.key] || horariosBase;
        const div = document.createElement("div");
        div.className = "dia-horario";
        div.dataset.dia = dia.key;
        div.innerHTML = `
            <div class="dia-nome">
                <label>
                    <input type="checkbox" ${configDia.ativo ? 'checked' : ''}>
                    ${dia.nome}
                </label>
            </div>
            <div class="horario-inputs">
                <input type="time" name="inicio" value="${configDia.inicio}">
                <span>às</span>
                <input type="time" name="fim" value="${configDia.fim}">
            </div>
        `;
        horariosContainerEl.appendChild(div);
    });
}


// --- FUNÇÕES PÚBLICAS (Controle do Modal) ---

/** Fecha o modal e limpa o estado. */
function fecharModal() {
    if (modalEl) modalEl.classList.remove('show');
    estado.profissionalAtual = null; // Limpa o estado para a próxima abertura
}

/** Salva as alterações de serviços e horários no Firebase.
    Só faz update quando o usuário clica no botão de salvar!
*/
async function salvarPerfil() {
    if (!estado.db || !estado.empresaId || !estado.profissionalAtual) {
        alert("❌ Erro: Dados insuficientes para salvar.");
        return;
    }

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'A guardar...';

    try {
        // Coleta os IDs dos serviços selecionados
        const servicosSelecionados = Array.from(servicosContainerEl.querySelectorAll('.servico-item.selected'))
            .map(item => item.dataset.servicoId);
        
        // Coleta os horários configurados
        const horarios = {};
        horariosContainerEl.querySelectorAll('.dia-horario').forEach(el => {
            const dia = el.dataset.dia;
            horarios[dia] = {
                ativo: el.querySelector('input[type="checkbox"]').checked,
                inicio: el.querySelector('input[name="inicio"]').value,
                fim: el.querySelector('input[name="fim"]').value
            };
        });
        
        const profissionalRef = doc(estado.db, "empresarios", estado.empresaId, "profissionais", estado.profissionalAtual.id);
        await updateDoc(profissionalRef, { 
            servicos: servicosSelecionados, // Salva um array de IDs de serviços
            horarios 
        });

        alert("✅ Perfil atualizado com sucesso!");
        fecharModal();
        // Opcional: Chamar uma função de callback para atualizar a lista na tela principal
        // if(estado.onSaveCallback) estado.onSaveCallback();

    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        alert("❌ Erro ao salvar perfil: " + error.message);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar Configurações';
    }
}

/**
 * Abre o modal de perfil para um profissional específico.
 * @param {object} profissional - O objeto completo do profissional a ser editado.
 * @param {Array} todosOsServicos - A lista de todos os serviços disponíveis na empresa.
 * @param {object} db - A instância do Firestore.
 * @param {string} empresaId - O ID da empresa.
 */
export function abrirModalPerfilProfissional(profissional, todosOsServicos, db, empresaId) {
    if (!modalEl || !profissional) return;

    // Configura o estado interno do módulo com os dados recebidos
    estado.profissionalAtual = profissional;
    estado.todosOsServicos = todosOsServicos;
    estado.db = db;
    estado.empresaId = empresaId;

    // Preenche o modal
    nomeEl.textContent = `👤 Perfil de ${profissional.nome}`;
    _renderizarServicos();
    _renderizarHorarios();

    // Exibe o modal
    modalEl.classList.add('show');
}


// --- INICIALIZAÇÃO DO MÓDULO ---

/** Busca todos os serviços cadastrados na empresa. */
export async function buscarTodosServicosDaEmpresa(db, empresaId) {
    if (!db || !empresaId) return [];
    try {
        const servicosRef = collection(db, "empresarios", empresaId, "servicos");
        const snapshot = await getDocs(servicosRef);
        const servicos = [];
        snapshot.forEach(doc => servicos.push({ id: doc.id, ...doc.data() }));
        return servicos;
    } catch (error) {
        console.error("Erro ao buscar todos os serviços:", error);
        return [];
    }
}


/** Configura os eventos estáticos do modal (botões, clique fora). */
export function inicializarModalPerfil() {
    if (!modalEl) return;
    btnCancelar.addEventListener("click", fecharModal);
    btnSalvar.addEventListener("click", salvarPerfil);
    modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl) { // Fecha apenas se clicar no fundo cinza
            fecharModal();
        }
    });
}
