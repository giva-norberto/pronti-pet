import { db, collection, getDocs, query, where } from './vitrini-firebase.js';

const listaServicosDiv = document.getElementById('lista-servicos');
const detalhesServicoDiv = document.getElementById('detalhes-servico');

/**
 * Formata preço para moeda brasileira
 */
function formatarPreco(preco) {
    if (preco === undefined || preco === null || preco === "") return "Preço não informado";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco);
}

/**
 * Formata duração
 */
function formatarDuracao(duracao) {
    if (!duracao) return "Duração não informada";
    return `${duracao} min`;
}

/**
 * Renderiza categorias como botões e exibe serviços da categoria escolhida
 */
function renderizarCategoriasEServicos(servicos) {
    if (!listaServicosDiv) return;

    if (!servicos || !Array.isArray(servicos) || servicos.length === 0) {
        listaServicosDiv.innerHTML = `<p>Nenhum serviço disponível.</p>`;
        if (detalhesServicoDiv) detalhesServicoDiv.innerHTML = '';
        return;
    }

    // Agrupa por categoria
    const agrupados = {};
    servicos.forEach(servico => {
        const cat = (servico.categoria && servico.categoria.trim()) ? servico.categoria.trim() : "Sem Categoria";
        if (!agrupados[cat]) agrupados[cat] = [];
        agrupados[cat].push(servico);
    });

    // Ordena categorias
    const categoriasOrdenadas = Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Renderiza categorias como botões/lista
    let htmlCategorias = `<div class="categorias-lista" style="margin-bottom:22px; display:flex; gap:8px; flex-wrap:wrap;">`;
    categoriasOrdenadas.forEach((cat, idx) => {
        htmlCategorias += `
            <button class="categoria-btn" data-cat="${cat}" style="padding:8px 18px; border-radius:20px; border:none; background:${idx===0 ?'#6366f1':'#e0e7ef'}; color:${idx===0 ?'#fff':'#22223b'}; font-weight:bold; cursor:pointer;">${cat}</button>
        `;
    });
    htmlCategorias += `</div><div id="servicos-por-categoria"></div>`;

    listaServicosDiv.innerHTML = htmlCategorias;

    // Lista dos serviços por categoria (exibe só da categoria ativa)
    function renderizarServicosDaCategoria(catAtual) {
        const servicosCat = agrupados[catAtual];
        if (!servicosCat || servicosCat.length === 0) {
            document.getElementById('servicos-por-categoria').innerHTML = `<p>Nenhum serviço nesta categoria.</p>`;
            if (detalhesServicoDiv) detalhesServicoDiv.innerHTML = '';
            return;
        }
        document.getElementById('servicos-por-categoria').innerHTML = servicosCat.map((servico, idx) => `
            <div class="servico-card" data-idx="${idx}" data-cat="${catAtual}" style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:18px; margin-bottom:12px; box-shadow:0 2px 4px rgba(0,0,0,0.04); cursor:pointer;">
                <h3 style="font-size:1.15em; margin:0 0 8px 0;">${servico.nome ? servico.nome : '<span style="color:red">Sem nome</span>'}</h3>
                <div style="color:#666;">${servico.preco !== undefined && servico.preco !== null ? formatarPreco(servico.preco) : '<span style="color:red">Preço não informado</span>'}</div>
            </div>
        `).join('');

        document.querySelectorAll('.servico-card').forEach(card => {
            card.onclick = () => {
                document.querySelectorAll('.servico-card.selecionado').forEach(c => c.classList.remove('selecionado'));
                card.classList.add('selecionado');
                renderizarDetalhesServicoVitrine(servicosCat[card.dataset.idx]);
            };
        });
    }

    // Evento de click nos botões de categoria
    listaServicosDiv.querySelectorAll('.categoria-btn').forEach((btn, idx) => {
        btn.onclick = () => {
            listaServicosDiv.querySelectorAll('.categoria-btn').forEach((b, i) => {
                b.style.background = '#e0e7ef';
                b.style.color = '#22223b';
            });
            btn.style.background = '#6366f1';
            btn.style.color = '#fff';
            renderizarServicosDaCategoria(btn.dataset.cat);
        };
    });

    // Inicializa mostrando a primeira categoria
    if (categoriasOrdenadas.length > 0) {
        renderizarServicosDaCategoria(categoriasOrdenadas[0]);
    }
}

/**
 * Renderiza detalhes do serviço selecionado
 */
function renderizarDetalhesServicoVitrine(servico) {
    if (!detalhesServicoDiv) return;
    detalhesServicoDiv.innerHTML = `
        <div class="detalhe-servico-card">
            <strong>Duração:</strong> ${servico.duracao ? formatarDuracao(servico.duracao) : "Duração não informada"}<br>
            <strong>Descrição:</strong> ${servico.descricao ? servico.descricao : "Sem descrição."}
        </div>
    `;
}

/**
 * Busca e carrega os serviços do Firebase para a vitrine.
 * Filtra apenas os serviços visíveis na vitrine.
 * Se profissionalId for fornecido, busca por profissional. Caso contrário, pela empresa.
 */
export async function carregarServicosVitrine(empresaId, profissionalId = null) {
    try {
        let servicosCol;
        if (profissionalId) {
            servicosCol = collection(db, "empresarios", empresaId, "profissionais", profissionalId, "servicos");
        } else {
            servicosCol = collection(db, "empresarios", empresaId, "servicos");
        }

        // Filtra apenas serviços visíveis na vitrine
        const servicosQuery = query(servicosCol, where("visivelNaVitrine", "==", true));
        const snap = await getDocs(servicosQuery);
        const servicos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // LOG para validação!
        console.log("SERVIÇOS VITRINE:", servicos);

        renderizarCategoriasEServicos(servicos);
    } catch (error) {
        console.error("Erro ao buscar serviços da vitrine:", error);
        if (listaServicosDiv) {
            listaServicosDiv.innerHTML = `<p>Erro ao carregar serviços. Tente novamente mais tarde.</p>`;
        }
        if (detalhesServicoDiv) {
            detalhesServicoDiv.innerHTML = '';
        }
    }
}
