// =====================================================================
//           VITRINE.JS - O Maestro da Aplicação (REVISADO E CORRIGIDO)
// ====================================================================

// --- MÓDulos IMPORTADOS ---
import { state, setEmpresa, setProfissionais, setTodosOsServicos, setAgendamento, resetarAgendamento, setCurrentUser } from './vitrini-state.js';
import { getEmpresaIdFromURL, getDadosEmpresa, getProfissionaisDaEmpresa, getHorariosDoProfissional, getTodosServicosDaEmpresa } from './vitrini-profissionais.js';
import { buscarAgendamentosDoDia, calcularSlotsDisponiveis, salvarAgendamento, buscarAgendamentosDoCliente, cancelarAgendamento, encontrarPrimeiraDataComSlots } from './vitrini-agendamento.js';
import { setupAuthListener, fazerLogin, fazerLogout } from './vitrini-auth.js';
import * as UI from './vitrini-ui.js';

// --- IMPORTS PARA PROMOÇÕES E FILA ---
import { db, auth } from './vitrini-firebase.js';
import { collection, query, where, getDocs, limit, addDoc, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// =====================================================================
// ✅ 1. IMPORTAÇÃO NECESSÁRIA ADICIONADA
// =====================================================================
import { marcarServicosInclusosParaUsuario } from './vitrine-assinatura-integration.js';


// --- Função utilitária para corrigir data no formato brasileiro ou ISO ---
function parseDataISO(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('-')) {
        return new Date(dateStr + "T00:00:00"); 
    }
    if (dateStr.includes('/')) {
        const [dia, mes, ano] = dateStr.split('/');
        return new Date(`${ano}-${mes}-${dia}T00:00:00`);
    }
    return new Date(dateStr);
}

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        UI.toggleLoader(true);

        const params = new URLSearchParams(window.location.search);
        let empresaId = params.get('empresa');
        
        const slug = window.location.pathname.substring(1);

        if (!empresaId && slug && slug !== 'vitrine.html' && slug !== 'index.html' && !slug.startsWith('r.html')) {
            console.log(`[Vitrine] ID não encontrado. Buscando empresa pelo slug: ${slug}`);
            
            const q = query(collection(db, "empresarios"), where("slug", "==", slug), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                empresaId = snapshot.docs[0].id;
                console.log(`[Vitrine] Empresa encontrada pelo slug. ID: ${empresaId}`);
            }
        }

        if (!empresaId) {
            empresaId = getEmpresaIdFromURL(); 
            if (!empresaId) {
                throw new Error("ID da Empresa não pôde ser determinado a partir da URL.");
            }
        }

        const [dados, profissionais, todosServicos] = await Promise.all([
            getDadosEmpresa(empresaId),
            getProfissionaisDaEmpresa(empresaId),
            getTodosServicosDaEmpresa(empresaId)
        ]);

        if (!dados) {
            throw new Error("Empresa não encontrada.");
        }

        setEmpresa(empresaId, dados);
        if (document.getElementById("logo-publico")) {
           document.getElementById("logo-publico").src = dados.logoUrl;
        }   
        if (document.getElementById("nome-negocio-publico")) {
            document.getElementById("nome-negocio-publico").textContent = dados.nomeFantasia;
        }
        setProfissionais(profissionais);
        setTodosOsServicos(todosServicos);

        await aplicarPromocoesNaVitrine(state.todosOsServicos, empresaId, null, true); 

        try {
            await marcarServicosInclusosParaUsuario(state.todosOsServicos, empresaId);
        } catch(err){
            console.info("Não foi possível verificar assinatura na carga inicial:", err.message);
        }

        UI.renderizarDadosIniciaisEmpresa(state.dadosEmpresa, state.todosOsServicos);
        UI.renderizarProfissionais(state.listaProfissionais);

        await renderizarPlanosDeAssinatura(empresaId);

        configurarEventosGerais();
        setupAuthListener(handleUserAuthStateChange);
        UI.toggleLoader(false);

    } catch (error) {
        console.error("Erro fatal na inicialização:", error.stack);
        document.getElementById("vitrine-loader").innerHTML = `<p style="text-align: center; color:red; padding: 20px;">${error.message}</p>`;
    }
});

// --- FUNÇÃO DE APLICAR PROMOÇÕES ---
async function aplicarPromocoesNaVitrine(listaServicos, empresaId, dataSelecionadaISO = null, forceNoPromo = false) {
    if (!empresaId) return;
    listaServicos.forEach(s => { s.promocao = null; }); 
    if (forceNoPromo || !dataSelecionadaISO) return; 

    const data = parseDataISO(dataSelecionadaISO);
    if (!data || isNaN(data.getTime())) return;
    const diaSemana = data.getDay(); 

    const promocoesRef = collection(db, "empresarios", empresaId, "precos_especiais");
    const snapshot = await getDocs(promocoesRef);
    const promocoesAtivas = [];

    snapshot.forEach(doc => {
        const promo = doc.data();
        let dias = Array.isArray(promo.diasSemana) ? promo.diasSemana.map(Number) : [];
        if (promo.ativo && dias.includes(diaSemana)) {
            promocoesAtivas.push({ id: doc.id, ...promo });
        }
    });

    listaServicos.forEach(servico => {
        let melhorPromocao = null;
        for (let promo of promocoesAtivas) {
            if (Array.isArray(promo.servicoIds) && promo.servicoIds.includes(servico.id)) {
                melhorPromocao = promo;
                break;
            }
        }
        if (!melhorPromocao) {
            melhorPromocao = promocoesAtivas.find(
                promo => promo.servicoIds == null || (Array.isArray(promo.servicoIds) && promo.servicoIds.length === 0)
            );
        }

        if (melhorPromocao) {
            let precoAntigo = servico.preco;
            let precoNovo = precoAntigo;
            if (melhorPromocao.tipoDesconto === "percentual") {
                precoNovo = precoAntigo * (1 - melhorPromocao.valor / 100);
            } else if (melhorPromocao.tipoDesconto === "valorFixo") {
                precoNovo = Math.max(precoAntigo - melhorPromocao.valor, 0);
            }
            servico.promocao = {
                nome: melhorPromocao.nome,
                precoOriginal: precoAntigo,
                precoComDesconto: precoNovo,
                tipoDesconto: melhorPromocao.tipoDesconto,
                valorDesconto: melhorPromocao.valor
            };
        }
    });
}

// --- FUNÇÃO PARA RENDERIZAR PLANOS ---
async function renderizarPlanosDeAssinatura(empresaId) {
    const planosDiv = document.getElementById('lista-de-planos'); 
    if (!planosDiv) {
        console.warn("Elemento 'lista-de-planos' não encontrado para renderizar planos.");
        return;
    }
    planosDiv.innerHTML = '<p style="text-align: center;">Carregando planos...</p>';
    try {
        const planosRef = collection(db, `empresarios/${empresaId}/planosDeAssinatura`);
        const snapshot = await getDocs(planosRef);
        if (snapshot.empty) {
            planosDiv.innerHTML = '<p>Nenhum plano disponível no momento.</p>';
            return;
        }
        planosDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const plano = doc.data();
            const planoId = doc.id;
            if (plano.ativo) {
                const precoFormatado = (plano.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const servicosHTML = Array.isArray(plano.servicosInclusos)
                    ? plano.servicosInclusos.map(s => `<li>${s.quantidade}x ${s.nomeServico}</li>`).join('')
                    : '';
                const card = document.createElement('div');
                card.className = 'card-plano-vitrine';
                card.style = 'background:#fff;border-radius:14px;box-shadow:0 4px 18px rgba(99,102,241,0.06);margin:18px 0;padding:22px;text-align:center;color:#333;'; 
                card.innerHTML = `
                    <h3 style="color:#4f46e5;">${plano.nome}</h3>
                    <p class="preco" style="color:#6366f1;font-weight:bold;font-size:1.2em;">${precoFormatado} / mês</p>
                    <p>${plano.descricao || ''}</p>
                    <ul style="list-style: '✓ ';padding-left: 20px; text-align: left;">${servicosHTML}</ul>
                    <button class="btn-assinar-plano" style="background:linear-gradient(90deg,#6366f1 0%,#4f46e5 100%);color:#fff;border:none;border-radius:8px;padding:8px 22px;margin-top:14px;font-size:1em;cursor:pointer;">Assinar</button>
                `;
                card.querySelector('.btn-assinar-plano').addEventListener('click', () => {
                    window.location.href = `vitrine-assinatura.html?empresaId=${encodeURIComponent(empresaId)}&planoId=${encodeURIComponent(planoId)}`;
                });
                planosDiv.appendChild(card);
            }
        });
    } catch (err) {
        console.error("Erro ao carregar planos de assinatura:", err);
        planosDiv.innerHTML = '<p style="color:red;">Ocorreu um erro ao carregar os planos.</p>';
    }
}

// --- FUNÇÃO DE CONFIGURAR EVENTOS ---
function configurarEventosGerais() {
    const addSafeListener = (selector, event, handler, isQuerySelector = false) => {
        const element = isQuerySelector ? document.querySelector(selector) : document.getElementById(selector);
        if (element) {
            element.addEventListener(event, handler);
        }
    };
    addSafeListener('.sidebar-menu', 'click', handleMenuClick, true);
    addSafeListener('.bottom-nav-vitrine', 'click', handleMenuClick, true);
    addSafeListener('lista-profissionais', 'click', handleProfissionalClick);
    addSafeListener('lista-servicos', 'click', handleServicoClick);
    addSafeListener('btn-prosseguir-data', 'click', handleProsseguirDataClick);
    addSafeListener('data-agendamento', 'change', handleDataChange);
    addSafeListener('grade-horarios', 'click', handleHorarioClick);
    addSafeListener('btn-login', 'click', fazerLogin); 
    addSafeListener('modal-auth-btn-google', 'click', fazerLogin); 
    addSafeListener('btn-logout', 'click', fazerLogout); 
    addSafeListener('btn-confirmar-agendamento', 'click', handleConfirmarAgendamento);
    addSafeListener('botoes-agendamento', 'click', handleFiltroAgendamentos);
    addSafeListener('lista-agendamentos-visualizacao', 'click', handleCancelarClick);
}

// --- FUNÇÃO DE MUDANÇA DE ESTADO AUTH ---
function handleUserAuthStateChange(user) {
    setCurrentUser(user);
    UI.atualizarUIdeAuth(user);
    UI.toggleAgendamentoLoginPrompt(!user);

    if (user && state.empresaId) {

        // 🔥 CRIA OU COMPLETA CLIENTE NO LOGIN (SEM MEXER NO TELEFONE)
        (async () => {
            try {
                const ref = doc(db, "empresarios", state.empresaId, "clientes", user.uid);
                const snap = await getDoc(ref);
                const perfil = snap.exists() ? snap.data() : {};

                await setDoc(ref, {
                    nome: perfil.nome || (user.displayName || "").toLowerCase(),
                    email: perfil.email || (user.email || "").toUpperCase(),
                    dataCadastro: perfil.dataCadastro || serverTimestamp(),
                    atualizadoEm: serverTimestamp()
                }, { merge: true });

            } catch (e) {
                console.warn("Erro ao criar/completar cliente:", e);
            }
        })();

        (async () => {
            try {
                await marcarServicosInclusosParaUsuario(state.todosOsServicos, state.empresaId);
                if (document.getElementById('lista-servicos')?.offsetParent !== null) {
                   UI.renderizarServicos(state.todosOsServicos.filter(s => state.agendamento?.profissional?.servicos?.includes(s.id)), state.agendamento?.profissional?.horarios?.permitirAgendamentoMultiplo);
                   state.agendamento?.servicos?.forEach(s => UI.selecionarCard('servico', s.id));
                   if(state.agendamento?.profissional?.horarios?.permitirAgendamentoMultiplo) {
                      UI.atualizarResumoAgendamento(state.agendamento.servicos);
                   } else {
                      UI.atualizarResumoAgendamentoFinal(); 
                   }
                }
            } catch (err) {
                 console.info("Não foi possível verificar assinatura após login:", err.message);
            }
        })();
    } else if (!user && state.empresaId) {
        state.todosOsServicos.forEach(s => {
            s.inclusoAssinatura = false;
            s.precoCobrado = undefined;
            s.assinaturasCandidatas = undefined;
        });
         if (document.getElementById('lista-servicos')?.offsetParent !== null) {
             UI.renderizarServicos(state.todosOsServicos.filter(s => state.agendamento?.profissional?.servicos?.includes(s.id)), state.agendamento?.profissional?.horarios?.permitirAgendamentoMultiplo);
             state.agendamento?.servicos?.forEach(s => UI.selecionarCard('servico', s.id)); 
             if(state.agendamento?.profissional?.horarios?.permitirAgendamentoMultiplo) {
                UI.atualizarResumoAgendamento(state.agendamento.servicos);
             } else {
                UI.atualizarResumoAgendamentoFinal();
             }
        }
    }

    if (user) {
        if (document.getElementById('menu-visualizacao')?.classList.contains('ativo')) { 
            handleFiltroAgendamentos({ target: document.getElementById('btn-ver-ativos') }); 
        }
    } else {
        if (document.getElementById('menu-visualizacao')?.classList.contains('ativo')) {
            if (UI.exibirMensagemDeLoginAgendamentos) UI.exibirMensagemDeLoginAgendamentos(); 
        }
    }
}
// --- FUNÇÃO DE CLIQUE NO MENU ---
function handleMenuClick(e) {
    const menuButton = e.target.closest('[data-menu]');
    if (menuButton) {
        const menuKey = menuButton.getAttribute('data-menu');
        UI.trocarAba(`menu-${menuKey}`); 
        if (menuKey === 'visualizacao') {
            if (state.currentUser) {
                handleFiltroAgendamentos({ target: document.getElementById('btn-ver-ativos') });
            } else {
                if (UI.exibirMensagemDeLoginAgendamentos) UI.exibirMensagemDeLoginAgendamentos();
            }
        }
    }
}

// --- FUNÇÃO DE CLIQUE NO PROFISSIONAL ---
async function handleProfissionalClick(e) {
    const card = e.target.closest('.card-profissional');
    if (!card) return;

    resetarAgendamento(); 
    UI.limparSelecao('servico'); UI.limparSelecao('horario'); UI.desabilitarBotaoConfirmar();
    UI.mostrarContainerForm(false); UI.renderizarServicos([]); UI.renderizarHorarios([]);

    const profissionalId = card.dataset.id;
    const profissional = state.listaProfissionais.find(p => p.id === profissionalId);
    UI.selecionarCard('profissional', profissionalId, true); 

    try {
        profissional.horarios = await getHorariosDoProfissional(state.empresaId, profissionalId);
        setAgendamento('profissional', profissional); 

        const permiteMultiplos = profissional.horarios?.permitirAgendamentoMultiplo || false;
        const servicosDoProfissional = (profissional.servicos || []).map(servicoId =>
            state.todosOsServicos.find(servico => servico.id === servicoId)
        ).filter(Boolean); 

         try {
            await marcarServicosInclusosParaUsuario(servicosDoProfissional, state.empresaId);
         } catch(err){
             console.info("Não foi possível verificar assinatura ao selecionar profissional:", err.message);
         }


        UI.mostrarContainerForm(true); 
        UI.renderizarServicos(servicosDoProfissional, permiteMultiplos);
        UI.configurarModoAgendamento(permiteMultiplos); 

    } catch (error) {
        console.error("Erro ao buscar horários do profissional:", error);
        await UI.mostrarAlerta("Erro", "Não foi possível carregar os dados deste profissional.");
    } finally {
        UI.selecionarCard('profissional', profissionalId, false); 
    }
}

// --- FUNÇÃO DE CLIQUE NO SERVIÇO ---
async function handleServicoClick(e) {
    const card = e.target.closest('.card-servico');
    if (!card) return;

    if (!state.agendamento.profissional) {
        await UI.mostrarAlerta("Atenção", "Por favor, selecione um profissional antes de escolher um serviço.");
        return;
    }

    const permiteMultiplos = state.agendamento.profissional.horarios?.permitirAgendamentoMultiplo || false;
    const servicoId = card.dataset.id;
    const servicoSelecionado = state.todosOsServicos.find(s => s.id === servicoId);

    let servicosAtuais = [...state.agendamento.servicos]; 

    if (permiteMultiplos) {
        const index = servicosAtuais.findIndex(s => s.id === servicoId);
        if (index > -1) {
            servicosAtuais.splice(index, 1); 
        } else {
            servicosAtuais.push(servicoSelecionado); 
        }
        card.classList.toggle('selecionado'); 
    } else {
        servicosAtuais = [servicoSelecionado]; 
        UI.selecionarCard('servico', servicoId); 
    }

    setAgendamento('servicos', servicosAtuais); 
    setAgendamento('data', null); 
    setAgendamento('horario', null);
    UI.limparSelecao('horario');
    UI.desabilitarBotaoConfirmar();

    if (permiteMultiplos) {
        UI.atualizarResumoAgendamento(servicosAtuais); 
    } else {
        document.getElementById('data-e-horario-container').style.display = 'block';
        if (servicosAtuais.length > 0) {
            await buscarPrimeiraDataDisponivel();
        }
    }
}

// --- FUNÇÃO BOTÃO PROSSEGUIR ---
async function handleProsseguirDataClick() {
    const servicos = state.agendamento.servicos;
    if (!servicos || servicos.length === 0) {
        await UI.mostrarAlerta("Atenção", "Selecione pelo menos um serviço para continuar.");
        return;
    }
    document.getElementById('data-e-horario-container').style.display = 'block';
    await buscarPrimeiraDataDisponivel(); 
}

// --- FUNÇÃO BUSCAR PRIMEIRA DATA ---
async function buscarPrimeiraDataDisponivel() {
    UI.atualizarStatusData(true, 'A procurar a data mais próxima com vagas...');
    const duracaoTotal = state.agendamento.servicos.reduce((total, s) => total + s.duracao, 0);
    try {
        const primeiraData = await encontrarPrimeiraDataComSlots(state.empresaId, state.agendamento.profissional, duracaoTotal);
        const dataInput = document.getElementById('data-agendamento');
        if (primeiraData) {
            dataInput.value = primeiraData; 
            dataInput.disabled = false;
            dataInput.dispatchEvent(new Event('change')); 
        } else {
            UI.renderizarHorarios([], 'Nenhuma data disponível para os serviços selecionados nos próximos 3 meses.');
            UI.atualizarStatusData(false);
        }
    } catch(error) {
        console.error("Erro ao encontrar data disponível:", error);
        await UI.mostrarAlerta("Erro", "Ocorreu um problema ao verificar a disponibilidade.");
        UI.atualizarStatusData(false);
    }
}

// --- FUNÇÃO MUDANÇA DE DATA ---
async function handleDataChange(e) {
    setAgendamento('data', e.target.value);
    setAgendamento('horario', null); 
    UI.limparSelecao('horario');
    UI.desabilitarBotaoConfirmar();

    const { profissional, servicos, data } = state.agendamento;
    const duracaoTotal = servicos.reduce((total, s) => total + s.duracao, 0);

    await aplicarPromocoesNaVitrine(state.todosOsServicos, state.empresaId, data, false);

     try {
        await marcarServicosInclusosParaUsuario(state.todosOsServicos, state.empresaId);
     } catch(err){
         console.info("Não foi possível verificar assinatura ao mudar data:", err.message);
     }

    if (profissional) {
        const permiteMultiplos = profissional.horarios?.permitirAgendamentoMultiplo || false;
        const servicosDoProfissional = (profissional.servicos || []).map(servicoId =>
            state.todosOsServicos.find(servico => servico.id === servicoId)
        ).filter(Boolean);
        UI.renderizarServicos(servicosDoProfissional, permiteMultiplos);
        state.agendamento.servicos.forEach(s => UI.selecionarCard('servico', s.id));
        if (permiteMultiplos) {
            UI.atualizarResumoAgendamento(state.agendamento.servicos);
        } else {
            UI.atualizarResumoAgendamentoFinal(); 
        }
    }

    if (!profissional || duracaoTotal === 0 || !data) return; 

    UI.renderizarHorarios([], 'A calcular horários...'); 

    try {
        const todosAgendamentos = await buscarAgendamentosDoDia(state.empresaId, data);
        const agendamentosProfissional = todosAgendamentos.filter(ag => ag.profissionalId === profissional.id);
        const slots = calcularSlotsDisponiveis(data, agendamentosProfissional, profissional.horarios, duracaoTotal);
        UI.renderizarHorarios(slots); 
    } catch (error) {
        console.error("Erro ao buscar agendamentos do dia:", error);
        UI.renderizarHorarios([], 'Erro ao carregar horários. Tente outra data.');
    }
}

// --- FUNÇÃO CLIQUE HORÁRIO ---
function handleHorarioClick(e) {
    const btn = e.target.closest('.btn-horario');
    if (!btn || btn.disabled) return; 

    setAgendamento('horario', btn.dataset.horario); 
    UI.selecionarCard('horario', btn.dataset.horario); 
    UI.atualizarResumoAgendamentoFinal(); 
    UI.habilitarBotaoConfirmar(); 
}

// ✅ ÚNICA FUNÇÃO ALTERADA (PARA CORRIGIR CÁLCULO DO PREÇO)
async function handleConfirmarAgendamento() {
    if (!state.currentUser) {
        await UI.mostrarAlerta("Login Necessário", "Você precisa de fazer login para confirmar o agendamento.");
        if (UI.abrirModalLogin) UI.abrirModalLogin();
        return;
    }

    // 🔥 AQUI (fora do if!)
    const podeSeguir = await exigirCelularParaAgendamento(state.currentUser);
    if (!podeSeguir) return;

    const { profissional, servicos, data, horario } = state.agendamento;

    if (!profissional || !servicos || servicos.length === 0 || !data || !horario) {
        await UI.mostrarAlerta("Informação Incompleta", "Por favor, selecione profissional, serviço(s), data e horário.");
        return;
    }

    const btn = document.getElementById('btn-confirmar-agendamento');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'A agendar...';
    try {
        const precoTotalCalculado = servicos.reduce((total, s) => {
            if (s.precoCobrado === 0) { 
                return total + 0;
            } else if (s.promocao) { 
                return total + (s.promocao.precoComDesconto || 0);
            } else { 
                return total + (s.preco || 0);
            }
        }, 0);

        const servicoParaSalvar = {
            id: servicos.map(s => s.id).join(','),
            nome: servicos.map(s => s.nome).join(' + '),
            duracao: servicos.reduce((total, s) => total + s.duracao, 0),
            preco: precoTotalCalculado 
        };

        const agendamentoParaSalvar = {
            profissional: state.agendamento.profissional,
            data: state.agendamento.data,
            horario: state.agendamento.horario,
            servico: servicoParaSalvar,
            empresa: state.dadosEmpresa
        };

        await salvarAgendamento(state.empresaId, state.currentUser, agendamentoParaSalvar);
        
        const nomeEmpresa = state.dadosEmpresa.nomeFantasia || "A empresa";
       await UI.mostrarAlerta("Agendamento Confirmado!", `${nomeEmpresa} agradece pelo seu agendamento.`);
       resetarAgendamento();
    
UI.trocarAba('menu-visualizacao');

// força UI renderizar antes de filtrar
requestAnimationFrame(() => {
    const btn = document.getElementById('btn-ver-ativos');

    if (!btn) return;

    btn.classList.add('ativo');

    handleFiltroAgendamentos({
        target: btn
    });
});
    } catch (error) {
        console.error("Erro ao salvar agendamento:", error);
        await UI.mostrarAlerta("Erro", `Não foi possível confirmar o agendamento. ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
}

// --- FUNÇÃO FILTRO AGENDAMENTOS ---
async function handleFiltroAgendamentos(e) {
    if (!e.target.matches('.btn-toggle') || !state.currentUser) return;
    const modo = e.target.id === 'btn-ver-ativos' ? 'ativos' : 'historico';
    UI.selecionarFiltro(modo); 
    UI.renderizarAgendamentosComoCards([], 'A buscar agendamentos...'); 
    try {
        const agendamentos = await buscarAgendamentosDoCliente(state.empresaId, state.currentUser, modo);
        UI.renderizarAgendamentosComoCards(agendamentos, modo); 
    } catch (error) {
        console.error("Erro ao buscar agendamentos do cliente:", error);
        await UI.mostrarAlerta("Erro de Busca", "Ocorreu um erro ao buscar os seus agendamentos.");
        UI.renderizarAgendamentosComoCards([], 'Não foi possível carregar os seus agendamentos.');
    }
}

// --- FUNÇÃO CANCELAR AGENDAMENTO ---
async function handleCancelarClick(e) {
    const btnCancelar = e.target.closest('.btn-cancelar');
    if (btnCancelar) {
        const agendamentoId = btnCancelar.dataset.id;
        const confirmou = await UI.mostrarConfirmacao("Cancelar Agendamento", "Tem a certeza de que deseja cancelar este agendamento? Esta ação não pode ser desfeita.");
        if (confirmou) {
            btnCancelar.disabled = true;
            btnCancelar.textContent = "A cancelar...";
            try {
                await cancelarAgendamento(state.empresaId, agendamentoId);
                await UI.mostrarAlerta("Sucesso", "Agendamento cancelado com sucesso!");
                handleFiltroAgendamentos({ target: document.querySelector('#botoes-agendamento .btn-toggle.ativo') });
            } catch (error) {
                console.error("Erro ao cancelar agendamento:", error);
                await UI.mostrarAlerta("Erro", `Não foi possível cancelar o agendamento. ${error.message}`);
                btnCancelar.disabled = false;
                btnCancelar.textContent = "Cancelar";
            }
        }
    }
}

// =====================================================================
// ✅ NOVA FUNÇÃO: ENTRAR NA FILA DE AGENDAMENTO
// =====================================================================
async function entrarNaFilaDeAgendamento() {
    const user = auth.currentUser;

    if (!user) {
        await UI.mostrarAlerta(
            "Login Necessário",
            "Você precisa estar logado para entrar na fila de espera."
        );

        if (UI.abrirModalLogin) {
            UI.abrirModalLogin();
        }

        return;
    }

    const empresaId = state.empresaId;
    const profissional = state.agendamento.profissional;

    const profissionalId = profissional?.id;
    const profissionalNome = profissional?.nome || "Profissional";

    const dataSelecionada = state.agendamento.data;
    const servicosSelecionados = state.agendamento.servicos || [];

    if (!empresaId) {
        await UI.mostrarAlerta(
            "Erro",
            "Empresa não identificada."
        );
        return;
    }

    if (!profissionalId) {
        await UI.mostrarAlerta(
            "Atenção",
            "Selecione um profissional antes de entrar na fila."
        );
        return;
    }

    if (!dataSelecionada || servicosSelecionados.length === 0) {
        await UI.mostrarAlerta(
            "Atenção",
            "Por favor, selecione os serviços e a data desejada antes de entrar na fila."
        );
        return;
    }

    try {
        const filaRef = collection(db, "fila_agendamentos");

        const servicosNormalizados = servicosSelecionados.map((s) => ({
            id: s.id,
            nome: s.nome,
            duracao: Number(s.duracao) || 0
        }));

        const duracaoTotal = servicosNormalizados.reduce(
            (total, s) => total + (Number(s.duracao) || 0),
            0
        );

        await addDoc(filaRef, {
            clienteId: user.uid,
            clienteNome: user.displayName || "Cliente",
            clienteEmail: user.email || null,

            empresaId: empresaId,

            profissionalId: profissionalId,
            profissionalNome: profissionalNome,

            servicos: servicosNormalizados,
            duracaoTotal: duracaoTotal,

            dataFila: dataSelecionada,

            // ✅ STATUS NOVO PADRONIZADO
            status: "aguardando",

            processando: false,

            origem: "vitrine",

            createdAt: serverTimestamp(),
            criadoEm: serverTimestamp()
        });

        await UI.mostrarAlerta(
            "Fila de Espera",
            "Pronto! Você entrou na fila de espera. Se surgir uma vaga, avisaremos você."
        );

        const containerFila = document.getElementById("container-fila-espera");

        if (containerFila) {
            containerFila.style.display = "none";
        }

    } catch (error) {
        console.error("Erro ao entrar na fila:", error);

        await UI.mostrarAlerta(
            "Erro",
            "Erro ao processar sua solicitação. Tente novamente."
        );
    }
}

// Expondo a função para o HTML (onclick)
window.entrarNaFilaDeAgendamento = entrarNaFilaDeAgendamento;
// =====================================================================
//    BLOCO CIRÚRGICO - EXIGIR TELEFONE NO PRIMEIRO AGENDAMENTO
// =====================================================================

async function exigirCelularParaAgendamento(user) {
    if (!user) return true;

    const docRef = doc(db, "empresarios", state.empresaId, "clientes", user.uid); 
    let perfil = {};

    try {
        const snap = await getDoc(docRef);
        perfil = snap.exists() ? snap.data() : {};
    } catch { 
        perfil = {}; 
    }

    // 🔥 normaliza telefone
    const telefoneSalvo = (perfil.telefone || "")
        .toString()
        .replace(/\D/g, "")
        .trim();

    // ✅ já tem telefone válido
    if (telefoneSalvo.length >= 9 && telefoneSalvo.length <= 15) {
        return true;
    }

    let telefone;

    while (true) {
        telefone = await pedirTelefoneModalPronti();

        if (telefone === null) return false;   // cancelou
        if (telefone === "skip") return true;  // seguir sem

        if (!telefone) continue;

        telefone = telefone.replace(/\D/g, "");

        if (telefone.length >= 9 && telefone.length <= 15) break;
    }

    // ✅ salva limpo
    await setDoc(docRef, { ...perfil, telefone }, { merge: true });

    return true;
}


// =====================================================================
//      FUNÇÃO MODAL PRONTI (CORRIGIDA)
// =====================================================================
function pedirTelefoneModalPronti() {
    return new Promise(resolve => {

        const modal = document.getElementById("modal-telefone-pronti");
        const input = document.getElementById("modal-telefone-input");
        const erro = document.getElementById("modal-telefone-erro");
        const btnOk = document.getElementById("modal-telefone-ok");
        const btnCancelar = document.getElementById("modal-telefone-cancelar");

        // 🔥 CORREÇÃO AQUI
        const btnSkip = document.getElementById("modal-telefone-seguir-sem");

        if (!modal || !input || !btnOk || !btnCancelar || !btnSkip) {
            console.error("Modal de telefone não encontrado no DOM");
            resolve("skip");
            return;
        }

        modal.style.display = "flex";
        input.value = "";
        erro.style.display = "none";

        setTimeout(() => input.focus(), 100);

        function confirmar() {
            let val = input.value.replace(/\D/g, "");

            if (val.length < 9) {
                erro.textContent = "Telefone inválido. Informe com DDD.";
                erro.style.display = "block";
                input.focus();
                return;
            }

            fechar(val);
        }

        function cancelar() {
            fechar(null);
        }

        function skip() {
            fechar("skip");
        }

        function fechar(retorno) {
            modal.style.display = "none";

            btnOk.onclick = null;
            btnCancelar.onclick = null;
            btnSkip.onclick = null;
            input.onkeydown = null;
            modal.onmousedown = null;
            window.removeEventListener("keydown", escHandler);

            resolve(retorno);
        }

        function enterHandler(ev) {
            if (ev.key === "Enter") confirmar();
        }

        function escHandler(ev) {
            if (ev.key === "Escape") cancelar();
        }

        btnOk.onclick = confirmar;
        btnCancelar.onclick = cancelar;
        btnSkip.onclick = skip;

        input.onkeydown = enterHandler;

        modal.onmousedown = (ev) => {
            if (ev.target === modal) cancelar();
        };

        window.addEventListener("keydown", escHandler);
    });
}
// =====================================================================
// 📥 SALVAR LOGO DO SALÃO NO CELULAR (VERSÃO ROBUSTA)
// =====================================================================
window.salvarSalaoPronti = async function () {
    const img = document.getElementById("logo-empresa");

    if (!img) {
        console.warn("Elemento #logo-empresa não encontrado no HTML");
        alert("Erro: logo não encontrada na tela.");
        return;
    }

    const src = img.src || img.getAttribute("src");

    if (!src || src.trim() === "") {
        alert("A logo ainda não carregou. Aguarde um pouco e tente novamente.");
        return;
    }

    try {
        // 🔥 tenta baixar como arquivo
        const response = await fetch(src);
        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "logo-salao.png";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.warn("Download direto falhou, abrindo imagem...", error);

        // 🔥 fallback: abre a imagem (funciona melhor em celular)
        window.open(src, "_blank");
    }
};
