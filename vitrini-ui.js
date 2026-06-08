// ======================================================================
//        VITRINI-UI.JS - UI da Vitrine com suporte Multiempresa (REVISADO E CORRIGIDO)
// ======================================================================

/**
 * Mostra ou esconde o loader inicial da página.
 */
export function toggleLoader(mostrar, mensagem = 'A carregar informações do negócio...') {
    const loader = document.getElementById('vitrine-loader');
    if (loader && loader.querySelector('p')) loader.querySelector('p').textContent = mensagem;
    if (loader) loader.style.display = mostrar ? 'block' : 'none';
    const content = document.getElementById('vitrine-content');
   if(content) content.style.display = mostrar ? 'none' : ''; // Apenas remove o 'display: none'

}

/**
 * Preenche os dados iniciais da empresa.
 * ALTERAÇÃO: Serviços agrupados por categoria, visual centralizado, sem botões.
 */
export function renderizarDadosIniciaisEmpresa(dadosEmpresa, todosOsServicos) {
    // ✅ CORREÇÃO: Preenche diretamente os elementos do cabeçalho mobile, que sabemos que existem.
    // As referências aos IDs 'logo-publico' e 'nome-negocio-publico' foram removidas para evitar o erro.
    const logoMobile = document.getElementById('logo-publico-mobile');
    if (logoMobile) {
        logoMobile.src = dadosEmpresa.logoUrl || "https://placehold.co/100x100/e0e7ff/6366f1?text=Logo";
    }

    const nomeMobile = document.getElementById('nome-negocio-publico-mobile' );
    if (nomeMobile) {
        nomeMobile.textContent = dadosEmpresa.nomeFantasia || "Nome do Negócio";
    }
    
    // A lógica para preencher a descrição e o resto da função permanece 100% idêntica.
    document.getElementById('info-negocio').innerHTML = `<p>${dadosEmpresa.descricao || "Descrição não informada."}</p>`;

    // ----------- SERVIÇOS AGRUPADOS POR CATEGORIA (LÓGICA 100% PRESERVADA) -----------
    const servicosContainer = document.getElementById('info-servicos');
    if (todosOsServicos && todosOsServicos.length > 0) {
        const agrupados = {};
        todosOsServicos.forEach(s => {
            const cat = (s.categoria && s.categoria.trim()) ? s.categoria.trim() : "Sem Categoria";
            if (!agrupados[cat]) agrupados[cat] = [];
            agrupados[cat].push(s);
        });
        const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        servicosContainer.innerHTML = categoriasOrdenadas.map(cat =>
            `<div class="info-categoria-bloco">
                <div class="info-categoria-titulo">${cat}</div>
                <div class="info-categoria-servicos">
                    ${agrupados[cat].map(s => {
                        let precoHtml = '';
                        if (s.promocao) {
                            precoHtml = `
                                <span class="preco-original" style="text-decoration:line-through; color:#ef4444; margin-right:8px;">R$ ${s.promocao.precoOriginal.toFixed(2)}</span>
                                <span class="preco-promocional" style="color:#059669; font-weight:bold;">R$ ${s.promocao.precoComDesconto.toFixed(2)}</span>
                                <span class="badge-promocao" style="background:#facc15; color:#92400e; border-radius:8px; padding:2px 8px; margin-left:8px; font-size:0.86em;">PROMO</span>
                            `;
                        } else {
                            precoHtml = `<span class="preco-promocional">R$ ${s.preco.toFixed(2)}</span>`;
                        }
                        return `
                            <div class="servico-info-item">
                                <strong>${s.nome}</strong>
                                <span>${precoHtml} (${s.duracao} min)</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`
        ).join('');
    } else {
        servicosContainer.innerHTML = '<p>Nenhum serviço cadastrado.</p>';
    }
    // ------------------------------------------------------------------------

    const contatoContainer = document.getElementById('info-contato');
    let htmlContato = '';
    if (dadosEmpresa.localizacao) {
        htmlContato += `<div class="info-item"><strong>Endereço:</strong><p>${dadosEmpresa.localizacao}</p></div><div class="info-item"><strong>Localização:</strong><div id="map-container" style="width: 100%; height: 250px; border-radius: 12px; background-color: #eef2ff; margin-top: 10px; overflow: hidden; border: 1px solid #e0e7ff;"><iframe src="https://maps.google.com/maps?q=${encodeURIComponent(dadosEmpresa.localizacao )}&t=&z=15&ie=UTF8&iwloc=&output=embed" width="100%" height="100%" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`;
    }
    if (dadosEmpresa.horarioFuncionamento) {
        htmlContato += `<div class="info-item"><strong>Horário de Atendimento:</strong><p style="white-space: pre-wrap;">${dadosEmpresa.horarioFuncionamento}</p></div>`;
    }
    if (dadosEmpresa.chavePix) {
        htmlContato += `<div class="info-item"><strong>PIX para Pagamento:</strong><p>${dadosEmpresa.chavePix}</p></div>`;
    }
    if (htmlContato === '') {
        htmlContato = '<p>Nenhuma informação de contato adicional foi fornecida.</p>';
    }
    contatoContainer.innerHTML = htmlContato;
}

/**
 * Renderiza os cards dos profissionais.
 */
export function renderizarProfissionais(profissionais) {
    const container = document.getElementById('lista-profissionais');
    container.innerHTML = '';
    if (!profissionais || profissionais.length === 0) {
        container.innerHTML = '<p>Nenhum profissional encontrado.</p>';
        return;
    }
    profissionais.forEach(p => {
        container.innerHTML += `<div class="card-profissional" data-id="${p.id}"><img src="${p.fotoUrl || 'https://placehold.co/80x80/eef2ff/4f46e5?text=P'}" alt="${p.nome}"><span>${p.nome}</span></div>`;
    } );
}

/**
 * REVISADO: Renderiza os cards de serviços agrupados por categoria, SEMPRE mostrando categoria, adaptando para seleção única ou múltipla.
 */
export function renderizarServicos(servicos, permiteMultiplos = false) {
    const container = document.getElementById('lista-servicos');
    container.innerHTML = '';
    container.className = permiteMultiplos ? 'servicos-container-cards multi-select' : 'servicos-container-cards';

    if (!servicos || servicos.length === 0) {
        container.innerHTML = '<p>Este profissional não oferece serviços.</p>';
        return;
    }

    // ---- AGRUPAMENTO POR CATEGORIA ----
    const agrupados = {};
    servicos.forEach(s => {
        const cat = (s.categoria && s.categoria.trim()) ? s.categoria.trim() : "Sem Categoria";
        if (!agrupados[cat]) agrupados[cat] = [];
        agrupados[cat].push(s);
    });

    const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    let htmlCategorias = `<div class="categorias-lista" style="margin-bottom:22px; display:flex; gap:8px; flex-wrap:wrap;">`;
    categoriasOrdenadas.forEach((cat, idx) => {
        htmlCategorias += `
            <button class="categoria-btn" data-cat="${cat}" style="padding:8px 18px; border-radius:20px; border:none; background:${idx===0 ?'#6366f1':'#e0e7ef'}; color:${idx===0 ?'#fff':'#22223b'}; font-weight:bold; cursor:pointer;">${cat}</button>
        `;
    });
    htmlCategorias += `</div><div id="servicos-por-categoria"></div>`;

    container.innerHTML = htmlCategorias;

    function renderizarServicosDaCategoria(catAtual) {
        const servicosCat = agrupados[catAtual];
        document.getElementById('servicos-por-categoria').innerHTML = servicosCat.map(s => {
            let precoHtml = '';
            
            // =====================================================================
            // ✅ 1. CORREÇÃO APLICADA AQUI (para o card do serviço)
            // =====================================================================
            if (s.precoCobrado === 0) { // Se assinatura cobriu o custo
                const precoZeroFormatado = Number(0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                precoHtml = `<span class="preco-promocional">${precoZeroFormatado}</span> <span class="badge-incluso">Incluso no plano</span>`;
            } else if (s.promocao) { // Senão, se tem promoção
                const precoOriginalFmt = (s.promocao.precoOriginal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const precoPromoFmt = (s.promocao.precoComDesconto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                precoHtml = `
                    <span class="preco-original" style="text-decoration:line-through; color:#ef4444; margin-right:8px;">${precoOriginalFmt}</span>
                    <span class="preco-promocional" style="color:#059669; font-weight:bold;">${precoPromoFmt}</span>
                    <span class="badge-promocao" style="background:#facc15; color:#92400e; border-radius:8px; padding:2px 8px; margin-left:8px; font-size:0.86em;">PROMO</span>
                `;
            } else { // Senão, preço normal
                const precoNormalFmt = (s.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                precoHtml = `<span class="preco-promocional">${precoNormalFmt}</span>`;
            }

            if (permiteMultiplos) {
                return `
                    <div class="card-servico card-checkbox" data-id="${s.id}">
                        <div class="servico-info-multi">
                            <span class="servico-nome">${s.nome}</span>
                            <span class="servico-detalhes">${precoHtml} - ${s.duracao} min</span>
                        </div>
                        <span class="checkmark"></span>
                    </div>
                `;
            } else {
                return `
                    <div class="card-servico" data-id="${s.id}">
                        <span class="servico-nome">${s.nome}</span>
                        <span class="servico-detalhes">${precoHtml} - ${s.duracao} min</span>
                    </div>
                `;
            }
        }).join('');
    }

    container.querySelectorAll('.categoria-btn').forEach((btn, idx) => {
        btn.onclick = () => {
            container.querySelectorAll('.categoria-btn').forEach((b, i) => {
                b.style.background = '#e0e7ef';
                b.style.color = '#22223b';
            });
            btn.style.background = '#6366f1';
            btn.style.color = '#fff';
            renderizarServicosDaCategoria(btn.dataset.cat);
        };
    });

    if (categoriasOrdenadas.length > 0) {
        renderizarServicosDaCategoria(categoriasOrdenadas[0]);
    }
}

/**
 * Renderiza os horários disponíveis.
 * ADIÇÃO: Gerenciamento automático do botão de Fila de Espera.
 */
export function renderizarHorarios(slots, mensagem = '') {
    const container = document.getElementById('grade-horarios');
    const containerFila = document.getElementById('container-fila-espera'); // Pega o novo container de fila
    container.innerHTML = '';

    if (mensagem) {
        container.innerHTML = `<p class="aviso-horarios">${mensagem}</p>`;
        if (containerFila) containerFila.style.display = 'block'; // Mostra fila se houver erro/mensagem
        return;
    }

    if (!slots || slots.length === 0) {
        container.innerHTML = '<p class="aviso-horarios">Nenhum horário disponível para esta data.</p>';
        if (containerFila) containerFila.style.display = 'block'; // Mostra botão da fila se estiver lotado
        return;
    }

    // Se chegou aqui, tem slots, então esconde o botão da fila
    if (containerFila) containerFila.style.display = 'none';

    slots.forEach(horario => {
        container.innerHTML += `<button class="btn-horario" data-horario="${horario}">${horario}</button>`;
    });
}

/**
 * Atualiza a UI de autenticação.
 */
export function atualizarUIdeAuth(user) {
    const userInfo = document.getElementById('user-info');
    const loginContainer = document.getElementById('btn-login-container');
    const agendamentosContainer = document.getElementById('botoes-agendamento');
    
    if (user) {
        if(agendamentosContainer) agendamentosContainer.style.display = 'flex';
        if(userInfo) userInfo.style.display = 'block';
        if(loginContainer) loginContainer.style.display = 'none';
        document.getElementById('user-photo').src = user.photoURL || 'https://placehold.co/80x80/eef2ff/4f46e5?text=User';
        document.getElementById('user-name' ).textContent = user.displayName || 'Usuário';
    } else {
        if(agendamentosContainer) agendamentosContainer.style.display = 'none';
        if(userInfo) userInfo.style.display = 'none';
        if(loginContainer) loginContainer.style.display = 'block';
        const listaAgendamentos = document.getElementById('lista-agendamentos-visualizacao');
        if(listaAgendamentos) listaAgendamentos.innerHTML = '';
    }
}

/**
 * Troca a aba visível.
 */
export function trocarAba(idDaAba) {
    const menuKey = idDaAba.replace('menu-', '');
    document.querySelectorAll('.menu-content').forEach(el => el.classList.remove('ativo'));
    document.querySelectorAll('[data-menu]').forEach(el => el.classList.remove('ativo'));
    
    const tela = document.getElementById(idDaAba);
    if(tela) tela.classList.add('ativo');

    const botoes = document.querySelectorAll(`.menu-btn[data-menu="${menuKey}"], .bottom-nav-vitrine button[data-menu="${menuKey}"]`);
    botoes.forEach(btn => btn.classList.add('ativo'));
}

/**
 * Seleciona um card e opcionalmente mostra um estado de 'loading'.
 */
export function selecionarCard(tipo, id, isLoading = false) {
    const seletorMap = { profissional: '.card-profissional', servico: '.card-servico', horario: '.btn-horario' };
    const seletor = seletorMap[tipo];
    if (!seletor) return;

    const element = document.querySelector(`${seletor}[data-${tipo === 'horario' ? 'horario' : 'id'}="${id}"]`);
    if (!element) return;

    if (tipo === 'servico' && element.closest('.multi-select')) {
        element.classList.toggle('selecionado');
    } else {
        document.querySelectorAll(seletor).forEach(c => c.classList.remove('selecionado'));
        element.classList.add('selecionado');
    }

    if (isLoading) element.classList.add('loading');
    else element.classList.remove('loading');
}

/**
 * Mostra o container do formulário de agendamento.
 */
export function mostrarContainerForm(mostrar) {
    const container = document.getElementById('agendamento-form-container');
    if(container) container.style.display = mostrar ? 'block' : 'none';
}

/**
 * Renderiza os agendamentos do cliente.
 */
export function renderizarAgendamentosComoCards(agendamentos, modo) {
    const container = document.getElementById('lista-agendamentos-visualizacao');
    if (!container) return;
    container.innerHTML = '';
    if (!agendamentos || agendamentos.length === 0) {
        container.innerHTML = `<p>Você não tem agendamentos ${modo === 'ativos' ? 'futuros' : 'passados'}.</p>`;
        return;
    }
    agendamentos.sort((a, b) => new Date(`${a.data}T${a.horario}`) - new Date(`${b.data}T${b.horario}`));
    agendamentos.forEach(ag => {
        const dataFormatada = new Date(`${ag.data}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        container.innerHTML += `
            <div class="card-agendamento status-${ag.status || 'ativo'}">
                <div class="agendamento-info">
                    <strong>${ag.servicoNome}</strong>
                    <span>com ${ag.profissionalNome}</span>
                    <small>${dataFormatada} às ${ag.horario}</small>
                </div>
                ${(modo === 'ativos' && ag.status !== 'cancelado_pelo_cliente') ? `<button class="btn-cancelar" data-id="${ag.id}">Cancelar</button>` : ''}
            </div>
        `;
    });
}

/**
 * Limpa a seleção de um tipo de card.
 */
export function limparSelecao(tipo) {
    const seletorMap = { profissional: '.card-profissional', servico: '.card-servico', horario: '.btn-horario' };
    const seletor = seletorMap[tipo];
    if (seletor) {
        document.querySelectorAll(seletor).forEach(c => c.classList.remove('selecionado'));
    }
}

/**
 * Atualiza o status do input de data.
 */
export function atualizarStatusData(desabilitarInput, mensagemHorarios = '') {
    const dataInput = document.getElementById('data-agendamento');
    if(dataInput) dataInput.disabled = desabilitarInput;
    renderizarHorarios([], mensagemHorarios);
}

/**
 * Seleciona o filtro (Ativos/Histórico).
 */
export function selecionarFiltro(modo) {
    document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('ativo'));
    const btnId = modo === 'ativos' ? 'btn-ver-ativos' : 'btn-ver-historico';
    const btn = document.getElementById(btnId);
    if(btn) btn.classList.add('ativo');
}

/**
 * Desabilita o botão de confirmar agendamento.
 */
export function desabilitarBotaoConfirmar() {
    const btn = document.getElementById('btn-confirmar-agendamento');
    if (btn) btn.disabled = true;
}

/**
 * Habilita o botão de confirmar agendamento.
 */
export function habilitarBotaoConfirmar() {
    const btn = document.getElementById('btn-confirmar-agendamento');
    if (btn) btn.disabled = false;
}

/**
 * Mostra/esconde a mensagem de login na tela de agendamento.
 */
export function toggleAgendamentoLoginPrompt(mostrar) {
    const prompt = document.getElementById('agendamento-login-prompt');
    if (prompt) prompt.style.display = mostrar ? 'block' : 'none';
}

/**
 * Mostra a mensagem de login na aba "Meus Agendamentos".
 */
export function exibirMensagemDeLoginAgendamentos() {
    const promptLogin = document.querySelector('#menu-visualizacao #agendamentos-login-prompt');
    const listaAgendamentos = document.getElementById('lista-agendamentos-visualizacao');
    const botoesFiltro = document.getElementById('botoes-agendamento');
    if (promptLogin) promptLogin.style.display = 'block';
    if (listaAgendamentos) listaAgendamentos.innerHTML = '';
    if (botoesFiltro) botoesFiltro.style.display = 'none';
}

/**
 * Força a abertura do modal de login.
 */
export function abrirModalLogin() {
    const modal = document.getElementById('modal-auth-janela');
    if (modal) {
        document.getElementById('modal-auth-cadastro').style.display = 'none';
        document.getElementById('modal-auth-login').style.display = 'block';
        modal.style.display = 'flex';
    }
}

/**
 * Mostra um alerta com uma mensagem, usando o modal customizado.
 */
export async function mostrarAlerta(titulo, mensagem) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const tituloEl = document.getElementById('modal-titulo');
        const mensagemEl = document.getElementById('modal-mensagem');
        const btnConfirmar = document.getElementById('modal-btn-confirmar');
        const btnCancelar = document.getElementById('modal-btn-cancelar');
        if (!modal || !tituloEl || !mensagemEl || !btnConfirmar || !btnCancelar) {
            alert(mensagem); resolve(); return;
        }
        tituloEl.textContent = titulo;
        mensagemEl.textContent = mensagem;
        btnCancelar.style.display = 'none';
        btnConfirmar.textContent = 'OK';
        modal.style.display = 'flex';
        const onConfirmar = () => {
            modal.style.display = 'none';
            btnCancelar.style.display = 'inline-block';
            btnConfirmar.textContent = 'Confirmar';
            resolve();
        };
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
        novoBtnConfirmar.addEventListener('click', onConfirmar, { once: true });
    });
}

/**
 * Mostra um modal de confirmação customizado (Sim/Não).
 */
export function mostrarConfirmacao(titulo, mensagem) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const tituloEl = document.getElementById('modal-titulo');
        const mensagemEl = document.getElementById('modal-mensagem');
        const btnConfirmar = document.getElementById('modal-btn-confirmar');
        const btnCancelar = document.getElementById('modal-btn-cancelar');
        if (!modal || !tituloEl || !mensagemEl || !btnConfirmar || !btnCancelar) {
            resolve(confirm(mensagem)); return;
        }
        tituloEl.textContent = titulo;
        mensagemEl.textContent = mensagem;
        btnCancelar.style.display = 'inline-block';
        btnConfirmar.textContent = 'Confirmar';
        modal.style.display = 'flex';
        const onConfirmar = () => { modal.style.display = 'none'; resolve(true); };
        const onCancelar = () => { modal.style.display = 'none'; resolve(false); };
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
        novoBtnConfirmar.addEventListener('click', onConfirmar, { once: true });
        const novoBtnCancelar = btnCancelar.cloneNode(true);
        btnCancelar.parentNode.replaceChild(novoBtnCancelar, btnCancelar);
        novoBtnCancelar.addEventListener('click', onCancelar, { once: true });
    });
}

/**
 * Atualiza o resumo do agendamento (total de serviços, duração e preço).
 */
export function atualizarResumoAgendamento(servicosSelecionados) {
    const container = document.getElementById('servicos-resumo-container');
    const textoEl = document.getElementById('resumo-texto');
    if (!container || !textoEl) return;

    if (servicosSelecionados.length > 0) {
        const duracaoTotal = servicosSelecionados.reduce((acc, s) => acc + s.duracao, 0);
        
        // =====================================================================
        // ✅ 2. CORREÇÃO APLICADA AQUI (para o resumo de múltiplos serviços)
        // =====================================================================
        const precoTotal = servicosSelecionados.reduce((acc, s) => {
            if (s.precoCobrado === 0) {
                return acc + 0;
            } else if (s.promocao) {
                return acc + (s.promocao.precoComDesconto || 0);
            } else {
                return acc + (s.preco || 0);
            }
        }, 0);
        
        textoEl.innerHTML = `<strong>Resumo:</strong> ${servicosSelecionados.length} serviço(s) | <strong>Duração:</strong> ${duracaoTotal} min | <strong>Total:</strong> ${precoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

/**
 * NOVO: Atualiza o resumo final do agendamento (embaixo, antes do botão Confirmar Agendamento)
 */
export function atualizarResumoAgendamentoFinal() {
    const agendamento = window.state?.agendamento || {};
    const { servicos, data, horario } = agendamento;
    const el = document.getElementById('resumo-agendamento-final');
    if (!el) return;
    if (!servicos || !data || !horario || servicos.length === 0) {
        el.innerHTML = '';
        return;
    }
    
    // =====================================================================
    // ✅ 3. CORREÇÃO APLICADA AQUI (para o resumo final)
    // =====================================================================
    const total = servicos.reduce((soma, s) => {
        if (s.precoCobrado === 0) {
            return soma + 0;
        } else if (s.promocao) {
            return soma + (s.promocao.precoComDesconto || 0);
        } else {
            return soma + (s.preco || 0);
        }
    }, 0);
    
    const duracao = servicos.reduce((soma, s) => soma + (s.duracao || 0), 0);
    const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

    el.innerHTML = `
        <div class="resumo-agendamento">
            <strong>Serviços:</strong> ${servicos.map(s => s.nome).join(" + ")} <br>
            <strong>Duração:</strong> ${duracao} min <br>
            <strong>Total:</strong> ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} <br>
            <strong>Data:</strong> ${dataFormatada} <strong>Horário:</strong> ${horario}
        </div>
        <hr>
    `;
}

/**
 * NOVO: Configura a UI para o modo de agendamento (único ou múltiplo).
 */
export function configurarModoAgendamento(permiteMultiplos) {
    const dataHorarioContainer = document.getElementById('data-e-horario-container');
    const resumoContainer = document.getElementById('servicos-resumo-container');
    const btnConfirmar = document.getElementById('btn-confirmar-agendamento');

    if (permiteMultiplos) {
        dataHorarioContainer.style.display = 'none';
        resumoContainer.style.display = 'none'; // Começa escondido
        if(btnConfirmar) btnConfirmar.style.display = 'block'; // Deixe SEMPRE display=block
    } else {
        dataHorarioContainer.style.display = 'none'; // Começa escondido até um serviço ser selecionado
        resumoContainer.style.display = 'none';
        if(btnConfirmar) btnConfirmar.style.display = 'block';
    }
}

/**
 * NOVO: Limpa toda a UI do agendamento, desmarcando seleções, escondendo containers
 * e limpando resumos. Use após salvar ou resetar agendamento.
 */
export function limparUIAgendamento() {
    limparSelecao('profissional');
    limparSelecao('servico');
    limparSelecao('horario');
    // Esconde containers
    const dataHorarioContainer = document.getElementById('data-e-horario-container');
    if (dataHorarioContainer) dataHorarioContainer.style.display = 'none';
    const resumoContainer = document.getElementById('servicos-resumo-container');
    if (resumoContainer) resumoContainer.style.display = 'none';
    // Limpa resumo final
    const resumoFinal = document.getElementById('resumo-agendamento-final');
    if (resumoFinal) resumoFinal.innerHTML = '';
    // Desabilita botão
    desabilitarBotaoConfirmar();
}
