/**
 * config-vitrine.js (VERSÃO CORRIGIDA E ALINHADA COM A ESTRUTURA 'empresarios')
 *
 * Lógica Principal:
 * 1. Usa a empresa ativa selecionada ('empresaAtivaId') do localStorage.
 * 2. Carrega a lista de serviços do array que está dentro do documento do profissional.
 * 3. Permite ativar/desativar a visibilidade de cada serviço na vitrine.
 * 4. Ao salvar, atualiza o array de serviços inteiro no Firestore.
 */

import { getFirestore, doc, getDoc, updateDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);
const auth = getAuth(app);

const listaServicosContainer = document.getElementById('lista-servicos-vitrine');
const btnPreview = document.getElementById('btn-preview-vitrine');

// --- MULTI-EMPRESA: lê empresa ativa do localStorage ---
const empresaAtivaId = localStorage.getItem("empresaAtivaId");
if (!empresaAtivaId) {
  window.location.href = "selecionar-empresa.html";
  throw new Error("Nenhuma empresa ativa encontrada.");
}

let profissionalRef = null; // Referência para o documento do profissional

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // A referência agora aponta para o documento do profissional (o dono) dentro da empresa ativa
        profissionalRef = doc(db, "empresarios", empresaAtivaId, "profissionais", user.uid);
        carregarServicosParaConfiguracao();
        configurarBotaoPreview();
    } else {
        window.location.href = 'login.html';
    }
});

/**
 * Carrega todos os serviços do empresário a partir do array no documento do profissional.
 */
async function carregarServicosParaConfiguracao() {
    if (!listaServicosContainer || !profissionalRef) return;
    listaServicosContainer.innerHTML = '<p>A carregar os seus serviços...</p>';

    try {
        const docSnap = await getDoc(profissionalRef);

        if (!docSnap.exists() || !docSnap.data().servicos || docSnap.data().servicos.length === 0) {
            listaServicosContainer.innerHTML = '<p>Você ainda não cadastrou nenhum serviço. Vá para a aba "Serviços" para começar.</p>';
            return;
        }

        const servicos = docSnap.data().servicos;
        listaServicosContainer.innerHTML = ''; // Limpa a lista

        servicos.forEach(servico => {
            const isVisible = servico.visivelNaVitrine !== false;
            const item = document.createElement('div');
            item.className = 'servico-item';
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

            item.innerHTML = `
                <div>
                    <h3>${servico.nome}</h3>
                    <p style="margin:0;">Preço: R$ ${parseFloat(servico.preco || 0).toFixed(2)}</p>
                </div>
                <label class="switch">
                    <input type="checkbox" class="toggle-visibilidade" data-id="${servico.id}" ${isVisible ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
            listaServicosContainer.appendChild(item);
        });

        adicionarListenersDeToggle();

    } catch (error) {
        console.error("Erro ao carregar serviços para configuração:", error);
        listaServicosContainer.innerHTML = '<p style="color:red;">Erro ao carregar os seus serviços.</p>';
    }
}

/**
 * Adiciona os "ouvintes" de eventos aos botões toggle.
 */
function adicionarListenersDeToggle() {
    listaServicosContainer.querySelectorAll('.toggle-visibilidade').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const servicoId = e.target.dataset.id;
            const isChecked = e.target.checked;
            atualizarVisibilidadeDoServico(servicoId, isChecked);
        });
    });
}

/**
 * Atualiza a visibilidade de um serviço dentro do array.
 * @param {string} servicoId - O ID do serviço a ser atualizado.
 * @param {boolean} isVisible - O novo estado de visibilidade.
 */
async function atualizarVisibilidadeDoServico(servicoId, isVisible) {
    try {
        // 1. Lê o documento do profissional para obter a lista mais recente de serviços.
        const docSnap = await getDoc(profissionalRef);
        if (!docSnap.exists()) throw new Error("Documento do profissional não encontrado.");
        
        const servicosAtuais = docSnap.data().servicos || [];

        // 2. Cria uma nova lista, alterando apenas o serviço com o ID correspondente.
        const novaListaDeServicos = servicosAtuais.map(s => {
            if (String(s.id) === servicoId) {
                return { ...s, visivelNaVitrine: isVisible };
            }
            return s;
        });

        // 3. Atualiza o documento no Firestore com a lista (array) inteira modificada.
        await updateDoc(profissionalRef, {
            servicos: novaListaDeServicos
        });
        
        // Opcional: Adicionar uma notificação de sucesso
        // alert("Visibilidade atualizada com sucesso!");

    } catch (error) {
        console.error("Erro ao atualizar a visibilidade do serviço:", error);
        alert("Não foi possível alterar a visibilidade do serviço.");
        // Recarrega a lista para reverter a mudança visual em caso de erro
        carregarServicosParaConfiguracao();
    }
}

/**
 * Configura o botão de pré-visualização para usar o 'empresaAtivaId'.
 */
function configurarBotaoPreview() {
    if (!btnPreview || !empresaAtivaId) return;

    const urlCompleta = `vitrine.html?empresa=${empresaAtivaId}`;
    
    btnPreview.addEventListener('click', () => {
        window.open(urlCompleta, '_blank');
    });
}
