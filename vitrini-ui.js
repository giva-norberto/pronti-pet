// ======================================================================
//        VITRINI-UI.JS - UI da Vitrine com suporte Multiempresa
//        PRONTI PET - Revisado com foto, preço por porte e cards menores
// ======================================================================

// ======================================================================
// HELPERS
// ======================================================================

function dinheiro(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escapeHTML(valor) {
    const div = document.createElement('div');
    div.textContent = valor || '';
    return div.innerHTML;
}

function obterFotoServico(servico) {
    return (
        servico?.fotoUrl ||
        servico?.imagemUrl ||
        servico?.fotoServicoUrl ||
        servico?.urlFoto ||
        servico?.imagem ||
        ''
    );
}

function obterPrecoDuracaoBase(servico) {
    if (Array.isArray(servico?.precos) && servico.precos.length > 0) {
        const validos = servico.precos
            .map(p => ({
                porte: p.porte || '',
                preco: Number(p.preco || 0),
                duracao: Number(p.duracao || 0)
            }))
            .filter(p => p.preco > 0 && p.duracao > 0)
            .sort((a, b) => a.preco - b.preco);

        if (validos.length > 0) {
            return {
                preco: validos[0].preco,
                duracao: validos[0].duracao,
                prefixo: 'A partir de '
            };
        }
    }

    return {
        preco: Number(servico?.preco || 0),
        duracao: Number(servico?.duracao || 0),
        prefixo: ''
    };
}

function calcularPrecoServico(servico) {
    if (!servico) return 0;

    if (servico.precoCobrado === 0) return 0;

    if (servico.promocao) {
        return Number(servico.promocao.precoComDesconto || 0);
    }

    return Number(servico.preco || 0);
}

function calcularDuracaoServico(servico) {
    return Number(servico?.duracao || 0);
}

function montarPrecoHtmlServico(servico) {
    const base = obterPrecoDuracaoBase(servico);

    if (servico?.precoCobrado === 0) {
        return `
            <span class="preco-promocional">${dinheiro(0)}</span>
            <span class="badge-incluso">Incluso no plano</span>
        `;
    }

    if (servico?.promocao && !Array.isArray(servico?.precos)) {
        const precoOriginal = Number(servico.promocao.precoOriginal || 0);
        const precoComDesconto = Number(servico.promocao.precoComDesconto || 0);

        return `
            <span class="preco-original" style="text-decoration:line-through; color:#ef4444; margin-right:8px;">
                ${dinheiro(precoOriginal)}
            </span>
            <span class="preco-promocional" style="color:#059669; font-weight:bold;">
                ${dinheiro(precoComDesconto)}
            </span>
            <span class="badge-promocao" style="background:#facc15; color:#92400e; border-radius:8px; padding:2px 8px; margin-left:8px; font-size:0.78em;">
                PROMO
            </span>
        `;
    }

    return `
        <span class="preco-promocional">
            ${base.prefixo}${dinheiro(base.preco)}
        </span>
    `;
}

function obterDuracaoBaseServico(servico) {
    return obterPrecoDuracaoBase(servico).duracao;
}

function injetarEstilosPetCards() {
    if (document.getElementById('style-vitrini-pet-cards')) return;

    const style = document.createElement('style');
    style.id = 'style-vitrini-pet-cards';
    style.textContent = `
        .servicos-container-cards {
            width: 100%;
        }

        .categorias-lista {
            margin-bottom: 14px !important;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .categoria-btn {
            padding: 7px 14px !important;
            border-radius: 999px !important;
            border: none !important;
            font-weight: 800 !important;
            cursor: pointer !important;
            font-size: 0.86rem !important;
        }

        #servicos-por-categoria {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
            gap: 12px;
        }

        .card-servico {
            background: #ffffff;
            border: 1px solid #e0e7ff;
            border-radius: 16px;
            padding: 10px;
            display: flex;
            gap: 11px;
            align-items: center;
            min-height: auto;
            cursor: pointer;
            box-shadow: 0 5px 14px rgba(15, 23, 42, 0.06);
            transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
            color: #1e293b;
        }

        .card-servico:hover {
            transform: translateY(-1px);
            border-color: #6366f1;
            box-shadow: 0 8px 18px rgba(79, 70, 229, 0.12);
        }

        .card-servico.selecionado {
            border-color: #4f46e5;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
            background: #f8faff;
        }

        .card-servico.card-checkbox {
            position: relative;
            padding-right: 36px;
        }

        .servico-foto {
            width: 62px;
            height: 62px;
            min-width: 62px;
            border-radius: 14px;
            object-fit: cover;
            background: linear-gradient(135deg, #eef2ff, #f5f3ff);
            border: 1px solid #e0e7ff;
        }

        .servico-foto-placeholder {
            width: 62px;
            height: 62px;
            min-width: 62px;
            border-radius: 14px;
            background: linear-gradient(135deg, #eef2ff, #f5f3ff);
            color: #4f46e5;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.55rem;
            border: 1px solid #e0e7ff;
        }

        .servico-conteudo {
            flex: 1;
            min-width: 0;
        }

        .servico-nome {
            display: block;
            font-weight: 900;
            font-size: 0.95rem;
            color: #1e293b;
            line-height: 1.2;
            margin-bottom: 4px;
        }

        .servico-detalhes {
            display: block;
            font-size: 0.86rem;
            color: #475569;
            line-height: 1.35;
        }

        .preco-promocional {
            color: #059669;
            font-weight: 900;
        }

        .servico-tempo {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: #64748b;
            font-weight: 700;
            margin-top: 2px;
        }

        .badge-incluso {
            background: #dcfce7;
            color: #166534;
            font-weight: 900;
            border-radius: 999px;
            padding: 2px 7px;
            font-size: 0.72rem;
            margin-left: 5px;
        }

        .checkmark {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 2px solid #c7d2fe;
        }

        .card-servico.selecionado .checkmark {
            background: #4f46e5;
            border-color: #4f46e5;
        }

        .info-categoria-bloco {
            margin-bottom: 18px;
        }

        .info-categoria-titulo {
            font-weight: 900;
            color: #4f46e5;
            margin: 12px 0 8px;
            font-size: 0.95rem;
            text-transform: uppercase;
            letter-spacing: .02em;
        }

        .info-categoria-servicos {
            display: grid;
            gap: 8px;
        }

        .servico-info-item {
            background: #fff;
            border: 1px solid #e0e7ff;
            border-radius: 14px;
            padding: 9px 11px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
            font-size: 0.9rem;
        }

        .servico-info-item strong {
            color: #1e293b;
        }

        .servico-info-item span {
            color: #475569;
            font-weight: 700;
            text-align: right;
        }

        /* ===========================
           MEUS AGENDAMENTOS
        =========================== */

        #lista-agendamentos-visualizacao {
            display: grid;
            gap: 12px;
        }

        .cliente-reserva-card {
            background: #ffffff;
            border-radius: 16px;
            padding: 12px;
            box-shadow: 0 5px 14px rgba(15, 23, 42, 0.08);
            border: 1px solid #e2e8f0;
            color: #1e293b;
        }

        .cliente-reserva-topo {
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }

        .cliente-reserva-foto,
        .cliente-reserva-foto-placeholder {
            width: 64px;
            height: 64px;
            min-width: 64px;
            max-width: 64px;
            max-height: 64px;
            border-radius: 14px;
            object-fit: cover;
            overflow: hidden;
            background: #eef2ff;
            border: 1px solid #e0e7ff;
        }

        .cliente-reserva-foto-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
        }

        .cliente-reserva-info {
            flex: 1;
            min-width: 0;
        }

        .cliente-reserva-linha-nome {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .cliente-reserva-linha-nome strong {
            color: #0f172a;
            font-size: 0.98rem;
            line-height: 1.2;
        }

        .cliente-reserva-sub {
            color: #64748b;
            font-size: .82rem;
            margin-top: 2px;
        }

        .cliente-reserva-servico,
        .cliente-reserva-data,
        .cliente-reserva-profissional {
            margin-top: 4px;
            font-size: .82rem;
            color: #334155;
            line-height: 1.25;
        }

        .cliente-reserva-status {
            font-size: .72rem;
            font-weight: 900;
            border-radius: 999px;
            padding: 4px 8px;
            white-space: nowrap;
        }

        .cliente-status-ativo {
            background: #dcfce7;
            color: #166534;
        }

        .cliente-status-cancelado {
            background: #fee2e2;
            color: #b91c1c;
        }

        .cliente-status-falta {
            background: #ffedd5;
            color: #c2410c;
        }

        .cliente-status-realizado {
            background: #dbeafe;
            color: #1d4ed8;
        }

        .cliente-reserva-observacao {
            margin-top: 10px;
            padding: 8px;
            border-radius: 10px;
            background: #fff7ed;
            border: 1px solid #fed7aa;
            font-size: .78rem;
            line-height: 1.35;
            color: #7c2d12;
            font-weight: 700;
        }

        .cliente-reserva-footer {
            margin-top: 10px;
            display: flex;
            justify-content: flex-end;
        }

        .cliente-reserva-cancelar {
            border: none;
            background: #ef4444;
            color: #fff;
            padding: 8px 12px;
            border-radius: 10px;
            font-weight: 800;
            cursor: pointer;
        }

        .cliente-reserva-cancelar:hover {
            background: #dc2626;
        }

        @media (max-width: 560px) {
            #servicos-por-categoria {
                grid-template-columns: 1fr;
                gap: 10px;
            }

            .card-servico {
                padding: 9px;
                border-radius: 14px;
            }

            .servico-foto,
            .servico-foto-placeholder {
                width: 54px;
                height: 54px;
                min-width: 54px;
                border-radius: 12px;
            }

            .servico-nome {
                font-size: 0.9rem;
            }

            .servico-detalhes {
                font-size: 0.8rem;
            }

            .servico-info-item {
                flex-direction: column;
                align-items: flex-start;
            }

            .servico-info-item span {
                text-align: left;
            }

            .cliente-reserva-card {
                padding: 10px;
                border-radius: 14px;
            }

            .cliente-reserva-foto,
            .cliente-reserva-foto-placeholder {
                width: 56px;
                height: 56px;
                min-width: 56px;
                max-width: 56px;
                max-height: 56px;
                border-radius: 12px;
            }

            .cliente-reserva-linha-nome strong {
                font-size: 0.92rem;
            }

            .cliente-reserva-sub,
            .cliente-reserva-servico,
            .cliente-reserva-data,
            .cliente-reserva-profissional {
                font-size: .78rem;
            }
        }
    `;

    document.head.appendChild(style);
}

function montarImagemServicoHtml(servico) {
    const foto = obterFotoServico(servico);

    if (foto) {
        return `
            <img
                class="servico-foto"
                src="${foto}"
                alt="${escapeHTML(servico?.nome || 'Serviço')}"
                onerror="this.outerHTML='<div class=&quot;servico-foto-placeholder&quot;>🐾</div>'"
            >
        `;
    }

    return `<div class="servico-foto-placeholder">🐾</div>`;
}

// ======================================================================
// LOADER
// ======================================================================

export function toggleLoader(mostrar, mensagem = 'A carregar informações do negócio...') {
    const loader = document.getElementById('vitrine-loader');

    if (loader && loader.querySelector('p')) {
        loader.querySelector('p').textContent = mensagem;
    }

    if (loader) {
        loader.style.display = mostrar ? 'block' : 'none';
    }

    const content = document.getElementById('vitrine-content');

    if (content) {
        content.style.display = mostrar ? 'none' : '';
    }
}

// ======================================================================
// DADOS INICIAIS DA EMPRESA
// ======================================================================

export function renderizarDadosIniciaisEmpresa(dadosEmpresa = {}, todosOsServicos = []) {
    injetarEstilosPetCards();

    const logoMobile = document.getElementById('logo-publico-mobile');

    if (logoMobile) {
        logoMobile.src = dadosEmpresa.logoUrl || "https://placehold.co/100x100/e0e7ff/6366f1?text=Pet";
    }

    const nomeMobile = document.getElementById('nome-negocio-publico-mobile');

    if (nomeMobile) {
        nomeMobile.textContent = dadosEmpresa.nomeFantasia || "Nome do Negócio";
    }

    const infoNegocio = document.getElementById('info-negocio');

    if (infoNegocio) {
        infoNegocio.innerHTML = `<p>${escapeHTML(dadosEmpresa.descricao || "Descrição não informada.")}</p>`;
    }
    // ================================
    // CARD MEUS PETS
    // ================================

const cardPetsContainer = document.getElementById('card-meus-pets');

if (cardPetsContainer) {
    cardPetsContainer.innerHTML = `
        <div class="card-meus-pets-vitrine">
            <div class="card-meus-pets-icon">🐾</div>

            <div class="card-meus-pets-info">
                <h3>Meus Pets</h3>
                <p>Cadastre e gerencie seus pets antes do agendamento.</p>
            </div>

            <button
                type="button"
                id="btn-meus-pets"
                class="btn-meus-pets">
                Gerenciar Pets
            </button>
        </div>
    `;
}
    const servicosContainer = document.getElementById('info-servicos');

    if (servicosContainer) {
        if (todosOsServicos && todosOsServicos.length > 0) {
            const agrupados = {};

            todosOsServicos.forEach(s => {
                const cat = (s.categoria && s.categoria.trim()) ? s.categoria.trim() : "Sem Categoria";
                if (!agrupados[cat]) agrupados[cat] = [];
                agrupados[cat].push(s);
            });

            const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR'));

            servicosContainer.innerHTML = categoriasOrdenadas.map(cat => `
                <div class="info-categoria-bloco">
                    <div class="info-categoria-titulo">${escapeHTML(cat)}</div>
                    <div class="info-categoria-servicos">
                        ${agrupados[cat].map(s => {
                            const base = obterPrecoDuracaoBase(s);
                            const precoHtml = montarPrecoHtmlServico(s);

                            return `
                                <div class="servico-info-item">
                                    <strong>${escapeHTML(s.nome || 'Serviço sem nome')}</strong>
                                    <span>
                                        ${precoHtml}
                                        ${base.duracao > 0 ? ` (${base.duracao} min)` : ''}
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `).join('');
        } else {
            servicosContainer.innerHTML = '<p>Nenhum serviço cadastrado.</p>';
        }
    }

    const contatoContainer = document.getElementById('info-contato');

    if (contatoContainer) {
        let htmlContato = '';

        if (dadosEmpresa.localizacao) {
            htmlContato += `
                <div class="info-item">
                    <strong>Endereço:</strong>
                    <p>${escapeHTML(dadosEmpresa.localizacao)}</p>
                </div>
                <div class="info-item">
                    <strong>Localização:</strong>
                    <div id="map-container" style="width:100%;height:250px;border-radius:12px;background-color:#eef2ff;margin-top:10px;overflow:hidden;border:1px solid #e0e7ff;">
                        <iframe
                            src="https://maps.google.com/maps?q=${encodeURIComponent(dadosEmpresa.localizacao)}&t=&z=15&ie=UTF8&iwloc=&output=embed"
                            width="100%"
                            height="100%"
                            style="border:0;"
                            allowfullscreen=""
                            loading="lazy"
                            referrerpolicy="no-referrer-when-downgrade">
                        </iframe>
                    </div>
                </div>
            `;
        }

        if (dadosEmpresa.horarioFuncionamento) {
            htmlContato += `
                <div class="info-item">
                    <strong>Horário de Atendimento:</strong>
                    <p style="white-space:pre-wrap;">${escapeHTML(dadosEmpresa.horarioFuncionamento)}</p>
                </div>
            `;
        }

        if (dadosEmpresa.whatsapp) {
            htmlContato += `
                <div class="info-item">
                    <strong>WhatsApp:</strong>
                    <p>${escapeHTML(dadosEmpresa.whatsapp)}</p>
                </div>
            `;
        }

        if (dadosEmpresa.instagram) {
            htmlContato += `
                <div class="info-item">
                    <strong>Instagram:</strong>
                    <p>${escapeHTML(dadosEmpresa.instagram)}</p>
                </div>
            `;
        }

        if (dadosEmpresa.chavePix) {
            htmlContato += `
                <div class="info-item">
                    <strong>PIX para Pagamento:</strong>
                    <p>${escapeHTML(dadosEmpresa.chavePix)}</p>
                </div>
            `;
        }

        if (htmlContato === '') {
            htmlContato = '<p>Nenhuma informação de contato adicional foi fornecida.</p>';
        }

        contatoContainer.innerHTML = htmlContato;
    }
}

// ======================================================================
// PROFISSIONAIS
// ======================================================================

export function renderizarProfissionais(profissionais) {
    const container = document.getElementById('lista-profissionais');
    if (!container) return;

    container.innerHTML = '';

    if (!profissionais || profissionais.length === 0) {
        container.innerHTML = '<p>Nenhum profissional encontrado.</p>';
        return;
    }

    profissionais.forEach(p => {
        container.innerHTML += `
            <div class="card-profissional" data-id="${p.id}">
                <img
                    src="${p.fotoUrl || 'https://placehold.co/80x80/eef2ff/4f46e5?text=P'}"
                    alt="${escapeHTML(p.nome || 'Profissional')}"
                >
                <span>${escapeHTML(p.nome || 'Profissional')}</span>
            </div>
        `;
    });
}

// ======================================================================
// SERVIÇOS - CARDS PET
// ======================================================================

export function renderizarServicos(servicos, permiteMultiplos = false) {
    injetarEstilosPetCards();

    const container = document.getElementById('lista-servicos');
    if (!container) return;

    container.innerHTML = '';
    container.className = permiteMultiplos
        ? 'servicos-container-cards multi-select'
        : 'servicos-container-cards';

    if (!servicos || servicos.length === 0) {
        container.innerHTML = '<p>Este profissional não oferece serviços.</p>';
        return;
    }

    const agrupados = {};

    servicos.forEach(s => {
        const cat = (s.categoria && s.categoria.trim()) ? s.categoria.trim() : "Sem Categoria";
        if (!agrupados[cat]) agrupados[cat] = [];
        agrupados[cat].push(s);
    });

    const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    let htmlCategorias = `
        <div class="categorias-lista">
            ${categoriasOrdenadas.map((cat, idx) => `
                <button
                    class="categoria-btn"
                    data-cat="${escapeHTML(cat)}"
                    style="background:${idx === 0 ? '#6366f1' : '#e0e7ef'}; color:${idx === 0 ? '#fff' : '#22223b'};"
                >
                    ${escapeHTML(cat)}
                </button>
            `).join('')}
        </div>
        <div id="servicos-por-categoria"></div>
    `;

    container.innerHTML = htmlCategorias;

    function renderizarServicosDaCategoria(catAtual) {
        const servicosCat = agrupados[catAtual] || [];
        const destino = document.getElementById('servicos-por-categoria');

        if (!destino) return;

        destino.innerHTML = servicosCat.map(s => {
            const base = obterPrecoDuracaoBase(s);
            const precoHtml = montarPrecoHtmlServico(s);
            const imagemHtml = montarImagemServicoHtml(s);
            const duracaoHtml = base.duracao > 0
                ? `<span class="servico-tempo">⏱ ${base.duracao} min</span>`
                : `<span class="servico-tempo">⏱ Tempo a confirmar</span>`;

            const conteudo = `
                ${imagemHtml}
                <div class="servico-conteudo">
                    <span class="servico-nome">${escapeHTML(s.nome || 'Serviço sem nome')}</span>
                    <span class="servico-detalhes">
                        ${precoHtml}
                        <br>
                        ${duracaoHtml}
                    </span>
                </div>
            `;

            if (permiteMultiplos) {
                return `
                    <div class="card-servico card-checkbox" data-id="${s.id}">
                        ${conteudo}
                        <span class="checkmark"></span>
                    </div>
                `;
            }

            return `
                <div class="card-servico" data-id="${s.id}">
                    ${conteudo}
                </div>
            `;
        }).join('');
    }

    container.querySelectorAll('.categoria-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.categoria-btn').forEach(b => {
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

// ======================================================================
// HORÁRIOS
// ======================================================================

export function renderizarHorarios(slots, mensagem = '') {
    const container = document.getElementById('grade-horarios');
    const containerFila = document.getElementById('container-fila-espera');

    if (!container) return;

    container.innerHTML = '';

    if (mensagem) {
        container.innerHTML = `<p class="aviso-horarios">${escapeHTML(mensagem)}</p>`;
        if (containerFila) containerFila.style.display = 'block';
        return;
    }

    if (!slots || slots.length === 0) {
        container.innerHTML = '<p class="aviso-horarios">Nenhum horário disponível para esta data.</p>';
        if (containerFila) containerFila.style.display = 'block';
        return;
    }

    if (containerFila) containerFila.style.display = 'none';

    slots.forEach(horario => {
        container.innerHTML += `<button class="btn-horario" data-horario="${horario}">${horario}</button>`;
    });
}

// ======================================================================
// AUTENTICAÇÃO
// ======================================================================

export function atualizarUIdeAuth(user) {
    const userInfo = document.getElementById('user-info');
    const loginContainer = document.getElementById('btn-login-container');
    const agendamentosContainer = document.getElementById('botoes-agendamento');

    if (user) {
        if (agendamentosContainer) agendamentosContainer.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'block';
        if (loginContainer) loginContainer.style.display = 'none';

        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');

        if (userPhoto) {
            userPhoto.src = user.photoURL || 'https://placehold.co/80x80/eef2ff/4f46e5?text=User';
        }

        if (userName) {
            userName.textContent = user.displayName || 'Usuário';
        }
    } else {
        if (agendamentosContainer) agendamentosContainer.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'block';

        const listaAgendamentos = document.getElementById('lista-agendamentos-visualizacao');
        if (listaAgendamentos) listaAgendamentos.innerHTML = '';
    }
}

// ======================================================================
// NAVEGAÇÃO / SELEÇÃO
// ======================================================================

export function trocarAba(idDaAba) {
    const menuKey = idDaAba.replace('menu-', '');

    document.querySelectorAll('.menu-content').forEach(el => el.classList.remove('ativo'));
    document.querySelectorAll('[data-menu]').forEach(el => el.classList.remove('ativo'));

    const tela = document.getElementById(idDaAba);
    if (tela) tela.classList.add('ativo');

    const botoes = document.querySelectorAll(
        `.menu-btn[data-menu="${menuKey}"], .bottom-nav-vitrine button[data-menu="${menuKey}"]`
    );

    botoes.forEach(btn => btn.classList.add('ativo'));
}

export function selecionarCard(tipo, id, isLoading = false) {
    const seletorMap = {
        profissional: '.card-profissional',
        servico: '.card-servico',
        horario: '.btn-horario'
    };

    const seletor = seletorMap[tipo];

    if (!seletor) return;

    const attr = tipo === 'horario' ? 'horario' : 'id';
    const element = document.querySelector(`${seletor}[data-${attr}="${id}"]`);

    if (!element) return;

    if (tipo === 'servico' && element.closest('.multi-select')) {
        element.classList.toggle('selecionado');
    } else {
        document.querySelectorAll(seletor).forEach(c => c.classList.remove('selecionado'));
        element.classList.add('selecionado');
    }

    if (isLoading) {
        element.classList.add('loading');
    } else {
        element.classList.remove('loading');
    }
}

export function limparSelecao(tipo) {
    const seletorMap = {
        profissional: '.card-profissional',
        servico: '.card-servico',
        horario: '.btn-horario'
    };

    const seletor = seletorMap[tipo];

    if (seletor) {
        document.querySelectorAll(seletor).forEach(c => c.classList.remove('selecionado'));
    }
}

// ======================================================================
// CONTAINER DE AGENDAMENTO
// ======================================================================

export function mostrarContainerForm(mostrar) {
    const container = document.getElementById('agendamento-form-container');
    if (container) container.style.display = mostrar ? 'block' : 'none';
}

export function atualizarStatusData(desabilitarInput, mensagemHorarios = '') {
    const dataInput = document.getElementById('data-agendamento');
    if (dataInput) dataInput.disabled = desabilitarInput;
    renderizarHorarios([], mensagemHorarios);
}

export function selecionarFiltro(modo) {
    document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('ativo'));

    const btnId = modo === 'ativos' ? 'btn-ver-ativos' : 'btn-ver-historico';
    const btn = document.getElementById(btnId);

    if (btn) btn.classList.add('ativo');
}

export function desabilitarBotaoConfirmar() {
    const btn = document.getElementById('btn-confirmar-agendamento');
    if (btn) btn.disabled = true;
}

export function habilitarBotaoConfirmar() {
    const btn = document.getElementById('btn-confirmar-agendamento');
    if (btn) btn.disabled = false;
}

export function toggleAgendamentoLoginPrompt(mostrar) {
    const prompt = document.getElementById('agendamento-login-prompt');
    if (prompt) prompt.style.display = mostrar ? 'block' : 'none';
}

export function exibirMensagemDeLoginAgendamentos() {
    const promptLogin = document.querySelector('#menu-visualizacao #agendamentos-login-prompt');
    const listaAgendamentos = document.getElementById('lista-agendamentos-visualizacao');
    const botoesFiltro = document.getElementById('botoes-agendamento');

    if (promptLogin) promptLogin.style.display = 'block';
    if (listaAgendamentos) listaAgendamentos.innerHTML = '';
    if (botoesFiltro) botoesFiltro.style.display = 'none';
}

export function abrirModalLogin() {
    const modal = document.getElementById('modal-auth-janela');

    if (modal) {
        const cadastro = document.getElementById('modal-auth-cadastro');
        const login = document.getElementById('modal-auth-login');

        if (cadastro) cadastro.style.display = 'none';
        if (login) login.style.display = 'block';

        modal.style.display = 'flex';
    }
}

// ======================================================================
// AGENDAMENTOS DO CLIENTE
// ======================================================================

export function renderizarAgendamentosComoCards(agendamentos, modo) {
    const container = document.getElementById('lista-agendamentos-visualizacao');

    if (!container) return;

    container.innerHTML = '';

    if (!agendamentos || agendamentos.length === 0) {
        container.innerHTML = `<p>Você não tem agendamentos ${modo === 'ativos' ? 'futuros' : 'passados'}.</p>`;
        return;
    }

    const formatarDataCurta = (dataISO) => {
        if (!dataISO) return 'Data não informada';

        return new Date(`${dataISO}T12:00:00Z`).toLocaleDateString('pt-BR', {
            timeZone: 'UTC',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatarPorte = (porte) => {
        if (!porte) return '';
        return String(porte).charAt(0).toUpperCase() + String(porte).slice(1).toLowerCase();
    };

    const statusTexto = (status) => {
        if (status === 'cancelado_pelo_cliente') return 'Cancelado';
        if (status === 'cancelado_pelo_gestor') return 'Cancelado';
        if (status === 'cancelado') return 'Cancelado';
        if (status === 'nao_compareceu') return 'Falta';
        if (status === 'realizado') return 'Realizado';
        return 'Ativo';
    };

    const statusClasse = (status) => {
        if (status === 'cancelado_pelo_cliente' || status === 'cancelado_pelo_gestor' || status === 'cancelado') {
            return 'cliente-status-cancelado';
        }

        if (status === 'nao_compareceu') return 'cliente-status-falta';
        if (status === 'realizado') return 'cliente-status-realizado';

        return 'cliente-status-ativo';
    };

    agendamentos.sort((a, b) => new Date(`${a.data}T${a.horario}`) - new Date(`${b.data}T${b.horario}`));

    agendamentos.forEach(ag => {
        const petNome = ag.petNome || ag.pet?.nome || 'Pet';
        const petPorte = ag.petPorte || ag.pet?.porte || '';
        const petRaca = ag.petRaca || ag.racaPet || ag.raca || ag.pet?.raca || '';
        const petFotoUrl = ag.petFotoUrl || ag.fotoPetUrl || ag.petFoto || ag.pet?.fotoUrl || '';
        const servicoNome = ag.servicoNome || ag.servico?.nome || 'Serviço';
        const profissionalNome = ag.profissionalNome || ag.profissional?.nome || 'Profissional';
        const observacaoPet = String(ag.observacaoPet || '').trim();
        const observacaoAgendamento = String(ag.observacaoAgendamento || '').trim();
        const dataFormatada = formatarDataCurta(ag.data);
        const horario = ag.horario || '--:--';
        const status = ag.status || 'ativo';

        const porteFormatado = formatarPorte(petPorte);

        const subtituloPet = petRaca && porteFormatado
            ? `${escapeHTML(petRaca)} • ${escapeHTML(porteFormatado)}`
            : escapeHTML(petRaca || porteFormatado || 'Porte não informado');

        const fotoPetHtml = petFotoUrl
            ? `
                <img
                    src="${escapeHTML(petFotoUrl)}"
                    alt="Foto de ${escapeHTML(petNome)}"
                    class="cliente-reserva-foto"
                    onerror="this.outerHTML='<div class=&quot;cliente-reserva-foto-placeholder&quot;>🐾</div>'"
                >
            `
            : `<div class="cliente-reserva-foto-placeholder">🐾</div>`;

        const podeCancelar = modo === 'ativos'
            && status !== 'cancelado_pelo_cliente'
            && status !== 'cancelado_pelo_gestor'
            && status !== 'cancelado'
            && status !== 'realizado'
            && status !== 'nao_compareceu';

        const obsResumo = observacaoAgendamento || observacaoPet;

        container.innerHTML += `
            <div class="cliente-reserva-card">
                <div class="cliente-reserva-cabecalho">
                    <span>🐾 ${escapeHTML(petNome)}</span>
                </div>

                <div class="cliente-reserva-conteudo">
                    <div class="cliente-reserva-topo">
                        ${fotoPetHtml}

                        <div class="cliente-reserva-info">
                            <div class="cliente-reserva-sub">${subtituloPet}</div>
                            <div class="cliente-reserva-servico">✂️ ${escapeHTML(servicoNome)}</div>
                            <div class="cliente-reserva-data">📅 ${escapeHTML(dataFormatada)} • 🕘 ${escapeHTML(horario)}</div>
                            <div class="cliente-reserva-profissional">🧑‍🔧 ${escapeHTML(profissionalNome)}</div>
                        </div>
                    </div>

                    ${
                        obsResumo
                            ? `
                                <div class="cliente-reserva-observacao">
                                    ${observacaoAgendamento ? `⚠️ ${escapeHTML(observacaoAgendamento)}` : ''}
                                    ${observacaoAgendamento && observacaoPet ? '<br>' : ''}
                                    ${observacaoPet ? `📌 ${escapeHTML(observacaoPet)}` : ''}
                                </div>
                            `
                            : ''
                    }

                    <div class="cliente-reserva-footer">
                        <span class="cliente-reserva-status ${statusClasse(status)}">
                            ${statusTexto(status)}
                        </span>

                        ${
                            podeCancelar
                                ? `
                                    <button class="btn-cancelar cliente-reserva-cancelar" data-id="${ag.id}">
                                        Cancelar
                                    </button>
                                `
                                : ''
                        }
                    </div>
                </div>
            </div>
        `;
    });
}
// ======================================================================
// MODAIS
// ======================================================================

export async function mostrarAlerta(titulo, mensagem) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const tituloEl = document.getElementById('modal-titulo');
        const mensagemEl = document.getElementById('modal-mensagem');
        const btnConfirmar = document.getElementById('modal-btn-confirmar');
        const btnCancelar = document.getElementById('modal-btn-cancelar');

        if (!modal || !tituloEl || !mensagemEl || !btnConfirmar || !btnCancelar) {
            alert(mensagem);
            resolve();
            return;
        }

        tituloEl.textContent = titulo;
        mensagemEl.textContent = mensagem;
        btnCancelar.style.display = 'none';
        btnConfirmar.textContent = 'OK';
        modal.style.display = 'flex';

        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);

        novoBtnConfirmar.addEventListener('click', () => {
            modal.style.display = 'none';
            btnCancelar.style.display = 'inline-block';
            novoBtnConfirmar.textContent = 'Confirmar';
            resolve();
        }, { once: true });
    });
}

export function mostrarConfirmacao(titulo, mensagem) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const tituloEl = document.getElementById('modal-titulo');
        const mensagemEl = document.getElementById('modal-mensagem');
        const btnConfirmar = document.getElementById('modal-btn-confirmar');
        const btnCancelar = document.getElementById('modal-btn-cancelar');

        if (!modal || !tituloEl || !mensagemEl || !btnConfirmar || !btnCancelar) {
            resolve(confirm(mensagem));
            return;
        }

        tituloEl.textContent = titulo;
        mensagemEl.textContent = mensagem;
        btnCancelar.style.display = 'inline-block';
        btnConfirmar.textContent = 'Confirmar';
        modal.style.display = 'flex';

        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);

        const novoBtnCancelar = btnCancelar.cloneNode(true);
        btnCancelar.parentNode.replaceChild(novoBtnCancelar, btnCancelar);

        novoBtnConfirmar.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(true);
        }, { once: true });

        novoBtnCancelar.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(false);
        }, { once: true });
    });
}

// ======================================================================
// RESUMOS
// ======================================================================

export function atualizarResumoAgendamento(servicosSelecionados = []) {
    const container = document.getElementById('servicos-resumo-container');
    const textoEl = document.getElementById('resumo-texto');

    if (!container || !textoEl) return;

    if (servicosSelecionados.length > 0) {
        const duracaoTotal = servicosSelecionados.reduce(
            (acc, s) => acc + calcularDuracaoServico(s),
            0
        );

        const precoTotal = servicosSelecionados.reduce(
            (acc, s) => acc + calcularPrecoServico(s),
            0
        );

        textoEl.innerHTML = `
            <strong>Resumo:</strong>
            ${servicosSelecionados.length} serviço(s)
            |
            <strong>Duração:</strong> ${duracaoTotal} min
            |
            <strong>Total:</strong> ${dinheiro(precoTotal)}
        `;

        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

export function atualizarResumoAgendamentoFinal() {
    const agendamento = window.state?.agendamento || {};
    const { servicos, data, horario, pet } = agendamento;

    const el = document.getElementById('resumo-agendamento-final');

    if (!el) return;

    if (!servicos || !data || !horario || servicos.length === 0) {
        el.innerHTML = '';
        return;
    }

    const total = servicos.reduce(
        (soma, s) => soma + calcularPrecoServico(s),
        0
    );

    const duracao = servicos.reduce(
        (soma, s) => soma + calcularDuracaoServico(s),
        0
    );

    const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    });

    el.innerHTML = `
        <div class="resumo-agendamento">
            ${pet?.nome ? `<strong>Pet:</strong> ${escapeHTML(pet.nome)} ${pet.porte ? `(${escapeHTML(pet.porte)})` : ''}<br>` : ''}
            <strong>Serviços:</strong> ${servicos.map(s => escapeHTML(s.nome)).join(" + ")} <br>
            <strong>Duração:</strong> ${duracao} min <br>
            <strong>Total:</strong> ${dinheiro(total)} <br>
            <strong>Data:</strong> ${dataFormatada} <strong>Horário:</strong> ${horario}
        </div>
        <hr>
    `;
}

// ======================================================================
// MODO AGENDAMENTO
// ======================================================================

export function configurarModoAgendamento(permiteMultiplos) {
    const dataHorarioContainer = document.getElementById('data-e-horario-container');
    const resumoContainer = document.getElementById('servicos-resumo-container');
    const btnConfirmar = document.getElementById('btn-confirmar-agendamento');

    if (dataHorarioContainer) dataHorarioContainer.style.display = 'none';
    if (resumoContainer) resumoContainer.style.display = 'none';
    if (btnConfirmar) btnConfirmar.style.display = 'block';
}

export function limparUIAgendamento() {
    limparSelecao('profissional');
    limparSelecao('servico');
    limparSelecao('horario');

    const dataHorarioContainer = document.getElementById('data-e-horario-container');
    if (dataHorarioContainer) dataHorarioContainer.style.display = 'none';

    const resumoContainer = document.getElementById('servicos-resumo-container');
    if (resumoContainer) resumoContainer.style.display = 'none';

    const resumoFinal = document.getElementById('resumo-agendamento-final');
    if (resumoFinal) resumoFinal.innerHTML = '';

    desabilitarBotaoConfirmar();
}
