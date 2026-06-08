// SPA menu logic com multiempresa (empresa ativa)
// Obtém empresaId da empresa ativa do localStorage (multiempresa)
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

document.querySelectorAll('.dashboard-menu .menu-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.dashboard-menu .menu-btn').forEach(b => b.classList.remove('ativo'));
        btn.classList.add('ativo');
        document.querySelectorAll('.dashboard-main .dashboard-tela').forEach(tela => tela.classList.remove('ativo'));
        document.getElementById('tela-' + btn.dataset.screen).classList.add('ativo');
        // Carrega dados por tela
        if (btn.dataset.screen === 'equipe') {
            carregarEquipe();
        } else if (btn.dataset.screen === 'agendamentos') {
            carregarAgendamentos();
        } else if (btn.dataset.screen === 'servicos') {
            carregarServicos();
        } else if (btn.dataset.screen === 'perfil') {
            carregarPerfil();
        }
    });
});

// -- Exemplo de renderização de profissionais (Gestão de Equipe) --
function carregarEquipe() {
    // Aqui você pode usar empresaId para buscar profissionais da empresa ativa
    const empresaId = getEmpresaIdAtiva();
    // Exemplo estático, substitua por consulta usando empresaId se necessário
    const equipe = [
        {id:'1',nome:'Maria',fotoUrl:'https://placehold.co/70x70?text=M'},
        {id:'2',nome:'João',fotoUrl:'https://placehold.co/70x70?text=J'},
        {id:'3',nome:'Ana',fotoUrl:'https://placehold.co/70x70?text=A'}
    ];
    const container = document.getElementById('conteudo-equipe');
    container.innerHTML = '';
    equipe.forEach(prof => {
        const div = document.createElement('div');
        div.className = 'card-profissional';
        div.setAttribute('data-id', prof.id);
        div.innerHTML = `<img src="${prof.fotoUrl}"><span>${prof.nome}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.card-profissional').forEach(c => c.classList.remove('selecionado'));
            div.classList.add('selecionado');
            window.state = window.state || {};
            window.state.profissionalSelecionado = prof;
        }
        container.appendChild(div);
    });
}

// -- Exemplo de Agendamentos --
function carregarAgendamentos() {
    // Aqui você pode usar empresaId para buscar agendamentos da empresa ativa
    const empresaId = getEmpresaIdAtiva();
    // Exemplo estático, substitua por consulta usando empresaId se necessário
    const container = document.getElementById('conteudo-agendamentos');
    container.innerHTML = "<p>Carregando agendamentos...</p>";
    setTimeout(() => {
        container.innerHTML = `
            <ul>
                <li>13/08 - Corte com João</li>
                <li>15/08 - Coloração com Maria</li>
            </ul>
        `;
    }, 500);
}

// -- Exemplo de Serviços --
function carregarServicos() {
    // Aqui você pode usar empresaId para buscar serviços da empresa ativa
    const empresaId = getEmpresaIdAtiva();
    // Exemplo estático, substitua por consulta usando empresaId se necessário
    const container = document.getElementById('conteudo-servicos');
    container.innerHTML = "<p>Carregando serviços...</p>";
    setTimeout(() => {
        container.innerHTML = `
            <ul>
                <li>Corte - R$ 40,00</li>
                <li>Coloração - R$ 80,00</li>
            </ul>
        `;
    }, 500);
}

// -- Exemplo de Perfil --
function carregarPerfil() {
    // Aqui você pode usar empresaId para buscar perfil da empresa ativa
    const empresaId = getEmpresaIdAtiva();
    // Exemplo estático, substitua por consulta usando empresaId se necessário
    const container = document.getElementById('conteudo-perfil');
    container.innerHTML = "<p>Carregando perfil...</p>";
    setTimeout(() => {
        container.innerHTML = `
            <img src="https://placehold.co/80x80" style="border-radius:50%;"><br>
            <strong>Giva Norberto</strong><br>
            <button>Sair</button>
        `;
    }, 500);
}

// Modal Firestore index (para erro de índice)
function mostrarModalIndiceFirestore(link) {
    document.getElementById('modal-msg-firestore').innerHTML =
      `Sua consulta precisa de um índice no Firestore.<br>Clique no link abaixo para criar o índice:<br><a href="${link}" target="_blank">${link}</a><br><br>Depois de criado, recarregue a página.`;
    document.getElementById('modal-firestore-index').style.display = 'flex';
}
document.getElementById('btn-fechar-modal').onclick = () => {
    document.getElementById('modal-firestore-index').style.display = 'none';
};

// Carregar tela inicial
carregarEquipe();
