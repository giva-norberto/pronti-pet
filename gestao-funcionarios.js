import { db, collection, doc, getDoc, getDocs, setDoc } from "./firebase-config.js";
import { getTodosServicosDaEmpresa } from "./vitrini-profissionais.js";

// MULTIEMPRESA: SEMPRE pega o empresaId do localStorage
const empresaId = localStorage.getItem("empresaAtivaId");
if (!empresaId) {
  alert("Nenhuma empresa ativa selecionada!");
  window.location.href = "selecionar-empresa.html";
  throw new Error("Nenhuma empresa ativa selecionada.");
}

let profissionais = [];
let servicosEmpresa = [];

// Carregar tudo ao iniciar
(async function initPainel() {
  servicosEmpresa = await getTodosServicosDaEmpresa(empresaId);
  await carregarProfissionais();
})();

async function carregarProfissionais() {
  const profissionaisRef = collection(db, "empresarios", empresaId, "profissionais");
  const snap = await getDocs(profissionaisRef);
  profissionais = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderizarListaProfissionais();
}

function renderizarListaProfissionais() {
  const lista = document.getElementById('lista-profissionais-painel');
  lista.innerHTML = profissionais.map(prof => `
    <div class="profissional-card" data-id="${prof.id}" style="border:1px solid #ddd;padding:10px;margin-bottom:10px;border-radius:8px;display:flex;align-items:center;gap:10px;">
      <img src="${prof.fotoUrl || 'https://placehold.co/40x40/eef2ff/4f46e5?text=P'}" style="width:40px;height:40px;border-radius:50%;">
      <span>${prof.nome}</span>
      <button class="btn-vincular-servicos" data-id="${prof.id}">Vincular Serviços</button>
    </div>
  `).join('');
}

document.getElementById('lista-profissionais-painel').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-vincular-servicos')) {
    const profId = e.target.dataset.id;
    const prof = profissionais.find(p => p.id === profId);
    if (prof) mostrarCamposEdicao(prof);
  }
});

function mostrarCamposEdicao(prof) {
  const container = document.getElementById('edicao-funcionario-container');
  // Serviços
  const servicosSelecionados = prof.servicosIds || prof.servicos || [];
  const servicosHtml = servicosEmpresa.map(srv => `
    <label style="display:block;margin-bottom:4px;">
      <input type="checkbox" value="${srv.id}" ${servicosSelecionados.includes(srv.id) ? 'checked' : ''}>
      ${srv.nome} (${srv.duracao}min, R$${srv.preco})
    </label>
  `).join('');
  // Intervalo
  const intervalo = prof.horarios?.intervalo || 30;
  // Editor de horários
  const horariosHtml = renderEditorHorariosFuncionario(prof.horarios);

  container.innerHTML = `
    <div style="border:1px solid #bcd;padding:16px;border-radius:8px;margin-top:10px;background:#f9f9ff;">
      <h4>Editar Funcionário: ${prof.nome}</h4>
      <div>
        <strong>Serviços:</strong>
        <div id="func-servicos">${servicosHtml}</div>
      </div>
      <div style="margin-top:12px;">
        <strong>Horários:</strong>
        <div id="func-horarios">${horariosHtml}</div>
      </div>
      <div style="margin-top:12px;">
        <label>Intervalo entre atendimentos:
          <select id="func-intervalo">
            <option value="15" ${intervalo==15?"selected":""}>15 min</option>
            <option value="30" ${intervalo==30?"selected":""}>30 min</option>
            <option value="45" ${intervalo==45?"selected":""}>45 min</option>
            <option value="60" ${intervalo==60?"selected":""}>60 min</option>
          </select>
        </label>
      </div>
      <button id="btn-salvar-funcionario" style="margin-top:18px;">Salvar</button>
    </div>
  `;
  // Adicionar eventos dinâmicos dos horários
  addEventosHorarios();
  // Botão de salvar
  document.getElementById('btn-salvar-funcionario').onclick = async function() {
    const servicosIds = Array.from(document.querySelectorAll('#func-servicos input[type=checkbox]:checked')).map(cb=>cb.value);
    const horarios = coletarHorariosEditados();
    horarios.intervalo = parseInt(document.getElementById('func-intervalo').value, 10);
    await setDoc(doc(db, "empresarios", empresaId, "profissionais", prof.id), {
      servicosIds,
      horarios
    }, { merge:true });
    alert('Funcionário atualizado!');
    await carregarProfissionais();
    container.innerHTML = '';
  };
}

// Renderiza o editor de horários
function renderEditorHorariosFuncionario(horarios) {
  const dias = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const labels = {seg:"Seg",ter:"Ter",qua:"Qua",qui:"Qui",sex:"Sex",sab:"Sáb",dom:"Dom"};
  return dias.map(dia=>{
    const h = horarios?.[dia] || {ativo:false, blocos:[]};
    return `
      <div style="margin-bottom:6px;">
        <label>
          <input type="checkbox" data-dia="${dia}" class="dia-ativo" ${h.ativo?'checked':''}> ${labels[dia]}
        </label>
        <span class="blocos-dia" data-dia="${dia}" ${h.ativo?'':'style="display:none;"'}>
          ${h.blocos?.map((b,i)=>`
            <input type="time" value="${b.inicio}" class="hora-inicio" data-dia="${dia}" data-i="${i}">
            até
            <input type="time" value="${b.fim}" class="hora-fim" data-dia="${dia}" data-i="${i}">
            <button type="button" class="rem-bloco" data-dia="${dia}" data-i="${i}">-</button>
          `).join('')}
          <button type="button" class="add-bloco" data-dia="${dia}">+</button>
        </span>
      </div>
    `;
  }).join('');
}

// Eventos para horários dinâmicos
function addEventosHorarios() {
  // Ativar/desativar dia mostra/esconde blocos
  document.querySelectorAll('.dia-ativo').forEach(cb=>{
    cb.onchange = e => {
      const dia = cb.dataset.dia;
      const blocos = document.querySelector(`.blocos-dia[data-dia="${dia}"]`);
      if (blocos) blocos.style.display = cb.checked ? '' : 'none';
    };
  });
  // Adicionar bloco
  document.querySelectorAll('.add-bloco').forEach(btn=>{
    btn.onclick = e=>{
      const dia = btn.dataset.dia;
      const blocos = btn.parentElement;
      const i = blocos.querySelectorAll('.hora-inicio').length;
      const html = `
        <input type="time" value="09:00" class="hora-inicio" data-dia="${dia}" data-i="${i}">
        até
        <input type="time" value="18:00" class="hora-fim" data-dia="${dia}" data-i="${i}">
        <button type="button" class="rem-bloco" data-dia="${dia}" data-i="${i}">-</button>
      `;
      const temp = document.createElement('span');
      temp.innerHTML = html;
      // Adiciona antes do botão +
      blocos.insertBefore(temp, btn);
      addEventosHorarios();// re-adiciona eventos para novos botões
    };
  });
  // Remover bloco
  document.querySelectorAll('.rem-bloco').forEach(btn=>{
    btn.onclick = e=>{
      btn.parentElement.remove();
    };
  });
}

// Coleta horários editados do editor
function coletarHorariosEditados() {
  const dias = ["seg","ter","qua","qui","sex","sab","dom"];
  const horarios = {};
  dias.forEach(dia=>{
    const ativo = document.querySelector(`input.dia-ativo[data-dia="${dia}"]`)?.checked || false;
    const blocos = [];
    document.querySelectorAll(`.blocos-dia[data-dia="${dia}"]`).forEach(container=>{
      container.querySelectorAll('.hora-inicio').forEach((input,i)=>{
        const inicio = input.value;
        const fim = container.querySelector(`.hora-fim[data-dia="${dia}"][data-i="${i}"]`)?.value || '';
        if (inicio && fim) blocos.push({inicio, fim});
      });
    });
    horarios[dia] = {ativo, blocos};
  });
  return horarios;
}
