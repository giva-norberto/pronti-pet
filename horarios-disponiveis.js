// Importações necessárias
import { getProfissionaisDaClinica } from './firebaseService.js'; // ou de onde vier
import { getHorariosLivres } from './horarioService.js'; // O módulo que calcula horários

// Elementos da DOM
let dataAlvoEl = null;
let relatorioContainerEl = null;
let clinicaIdGlobal = null;

/**
 * Ponto de entrada, chamado pelo HTML
 */
export async function iniciar(clinicaId) {
    clinicaIdGlobal = clinicaId;
    
    // Mapear elementos
    dataAlvoEl = document.getElementById('data-alvo-display');
    relatorioContainerEl = document.getElementById('relatorio-container');
    
    // Iniciar o processo
    await carregarRelatorio();
}

/**
 * Define a data-alvo (Hoje ou Amanhã, baseado na HORA_CORTE)
 */
function definirDataAlvo() {
    const agora = new Date();
    const HORA_CORTE = 17; // 17h

    // Se a hora atual for 17h ou mais, pula para o dia seguinte
    if (agora.getHours() >= HORA_CORTE) {
        agora.setDate(agora.getDate() + 1);
    }
    
    // Formata a data para "YYYY-MM-DD"
    const offset = agora.getTimezoneOffset();
    const dataFormatada = new Date(agora.getTime() - (offset * 60 * 1000));
    return dataFormatada.toISOString().split('T')[0];
}

/**
 * Orquestra a criação do relatório
 */
async function carregarRelatorio() {
    const dataAlvo = definirDataAlvo();

    // Atualiza o display da data na tela
    const [ano, mes, dia] = dataAlvo.split('-');
    dataAlvoEl.textContent = `${dia}/${mes}/${ano}`;

    try {
        // 1. Buscar todos os profissionais
        const profissionais = await getProfissionaisDaClinica(clinicaIdGlobal);
        
        if (!profissionais || profissionais.length === 0) {
            relatorioContainerEl.innerHTML = '<p id="relatorio-placeholder">Nenhum profissional encontrado.</p>';
            return;
        }
        
        // Limpa o placeholder "A carregar..."
        relatorioContainerEl.innerHTML = '';

        // 2. Criar uma "promessa" para cada profissional.
        // Isso permite carregar os horários de todos em paralelo.
        const promessas = profissionais.map(prof => 
            processarCardFuncionario(prof, dataAlvo)
        );
        
        // Espera que todos os cards de funcionário terminem de carregar
        await Promise.all(promessas);
        
    } catch (error) {
        console.error("Erro ao gerar relatório:", error);
        relatorioContainerEl.innerHTML = '<p id="relatorio-placeholder" style="color: red;">Erro ao carregar dados.</p>';
    }
}

/**
 * Processa um único funcionário: 
 * Cria seu card e busca seus horários.
 */
async function processarCardFuncionario(prof, dataAlvo) {
    const DURACAO_PADRAO_MIN = 30; // Duração padrão para consulta
    
    // 1. Cria a estrutura do card
    const card = document.createElement('div');
    card.className = 'funcionario-card';
    
    // 2. Adiciona o nome
    const nomeEl = document.createElement('h3');
    nomeEl.className = 'funcionario-nome';
    nomeEl.textContent = prof.nome;
    card.appendChild(nomeEl);
    
    // 3. Adiciona o contêiner da grade (com placeholder)
    const gradeEl = document.createElement('div');
    gradeEl.className = 'grade-horarios-container'; // Classe de estilo
    gradeEl.innerHTML = '<p class="aviso-horarios">A carregar horários...</p>';
    card.appendChild(gradeEl);
    
    // 4. Adiciona o card à tela (para o usuário já ir vendo)
    relatorioContainerEl.appendChild(card);
    
    // 5. Busca os horários e renderiza a grade
    try {
        const horarios = await getHorariosLivres(dataAlvo, prof.id, DURACAO_PADRAO_MIN, clinicaIdGlobal);
        renderizarGradeInterna(gradeEl, horarios);
        
    } catch (error) {
        console.error(`Erro ao buscar horários de ${prof.nome}:`, error);
        gradeEl.innerHTML = '<p class="aviso-horarios" style="color: red;">Erro ao buscar horários.</p>';
    }
}

/**
 * Renderiza a grade de horários DENTRO do contêiner de um funcionário
 */
function renderizarGradeInterna(containerGrade, horarios) {
    if (!horarios || horarios.length === 0) {
        containerGrade.innerHTML = '<p class="aviso-horarios">Nenhum horário livre encontrado.</p>';
        return;
    }

    containerGrade.innerHTML = ''; // Limpa o "A carregar..."
    
    horarios.forEach(slot => {
        const div = document.createElement('div');
        div.className = 'slot-horario livre'; // Estilo verde
        div.textContent = slot.inicio; // Ex: "09:00"
        containerGrade.appendChild(div);
    });
}
