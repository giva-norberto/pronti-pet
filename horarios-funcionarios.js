import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);
const auth = getAuth(app);

const diasDaSemana = [
  { id: 'segunda', nome: 'Segunda-feira' },
  { id: 'terca', nome: 'Terça-feira' },
  { id: 'quarta', nome: 'Quarta-feira' },
  { id: 'quinta', nome: 'Quinta-feira' },
  { id: 'sexta', nome: 'Sexta-feira' },
  { id: 'sabado', nome: 'Sábado' },
  { id: 'domingo', nome: 'Domingo' }
];

let empresaId = null;
let profissionalId = null;
let horariosRef = null;

window.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    empresaId = localStorage.getItem('empresaAtivaId');

    if (!empresaId) {
      alert("Nenhuma empresa ativa selecionada!");
      window.location.href = "selecionar-empresa.html";
      return;
    }

    profissionalId = user.uid;

    horariosRef = doc(
      db,
      "empresarios",
      empresaId,
      "profissionais",
      profissionalId,
      "configuracoes",
      "horarios"
    );

    console.log('Caminho completo da referência do Firestore:', horariosRef.path);

    gerarEstruturaDosDias();
    gerarConfiguracaoCapacidadePets();

    await carregarHorarios();

    const form = document.getElementById('form-horarios');
    if (form) form.addEventListener('submit', handleFormSubmit);

    const btnVoltar = document.getElementById('btn-voltar-modal-perfil');
    if (btnVoltar) btnVoltar.onclick = () => window.history.back();
  });
});

/**
 * Cria a configuração geral de capacidade de pets por horário.
 * Sem depender de alteração manual no HTML.
 */
function gerarConfiguracaoCapacidadePets() {
  if (document.getElementById('config-capacidade-pets')) return;

  const intervaloInput = document.getElementById("intervalo-atendimento");
  const form = document.getElementById("form-horarios");

  if (!form) return;

  const bloco = document.createElement("div");
  bloco.id = "config-capacidade-pets";
  bloco.style.cssText = `
    margin: 18px 0;
    padding: 16px;
    border: 1px solid #e0e7ff;
    border-radius: 14px;
    background: #f8faff;
  `;

  bloco.innerHTML = `
    <h3 style="margin:0 0 10px;color:#1e1b4b;font-size:1rem;">
      Capacidade de atendimento PET
    </h3>

    <label style="display:flex;align-items:center;gap:10px;font-weight:700;color:#334155;margin-bottom:12px;">
      <input type="checkbox" id="permitir-agendamento-multiplo">
      Permitir mais de um pet no mesmo horário
    </label>

    <label for="capacidade-pets-horario" style="display:block;font-weight:700;color:#334155;margin-bottom:6px;">
      Quantos pets por horário?
    </label>

    <input
      type="number"
      id="capacidade-pets-horario"
      min="1"
      max="20"
      value="1"
      style="width:100%;max-width:160px;padding:10px;border:1px solid #c7d2fe;border-radius:10px;font-weight:700;"
    >

    <p style="margin:10px 0 0;color:#64748b;font-size:0.88rem;line-height:1.35;">
      Exemplo: se colocar 3, o sistema poderá aceitar até 3 pets no mesmo horário para este profissional.
    </p>
  `;

  if (intervaloInput && intervaloInput.closest('div')) {
    intervaloInput.closest('div').insertAdjacentElement('afterend', bloco);
  } else {
    form.insertBefore(bloco, form.firstChild);
  }

  const check = bloco.querySelector("#permitir-agendamento-multiplo");
  const capacidade = bloco.querySelector("#capacidade-pets-horario");

  check.addEventListener("change", () => {
    if (!check.checked) {
      capacidade.value = 1;
      capacidade.disabled = true;
    } else {
      capacidade.disabled = false;
      if (Number(capacidade.value || 0) < 2) capacidade.value = 2;
    }
  });

  capacidade.disabled = true;
}

/**
 * Carrega os horários do Firestore e preenche o formulário.
 */
async function carregarHorarios() {
  if (!horariosRef) {
    console.warn("horariosRef não existe");
    return;
  }

  const snap = await getDoc(horariosRef);

  let horarios = {};
  let intervalo = 30;
  let permitirAgendamentoMultiplo = false;
  let capacidadePetsPorHorario = 1;

  if (snap.exists()) {
    horarios = snap.data() || {};
    intervalo = horarios.intervalo || 30;
    permitirAgendamentoMultiplo = !!horarios.permitirAgendamentoMultiplo;
    capacidadePetsPorHorario = Number(horarios.capacidadePetsPorHorario || 1);
  }

  const intervaloInput = document.getElementById("intervalo-atendimento");
  if (intervaloInput) intervaloInput.value = intervalo;

  const checkMultiplo = document.getElementById("permitir-agendamento-multiplo");
  const capacidadeInput = document.getElementById("capacidade-pets-horario");

  if (checkMultiplo) checkMultiplo.checked = permitirAgendamentoMultiplo;

  if (capacidadeInput) {
    capacidadeInput.value = capacidadePetsPorHorario > 0 ? capacidadePetsPorHorario : 1;
    capacidadeInput.disabled = !permitirAgendamentoMultiplo;
  }

  diasDaSemana.forEach(dia => {
    const diaData = horarios[dia.id] || {};
    const ativoInput = document.getElementById(`${dia.id}-ativo`);

    if (ativoInput) {
      ativoInput.checked = !!diaData.ativo;

      const blocosDiv = document.getElementById(`blocos-${dia.id}`);

      if (blocosDiv) {
        blocosDiv.innerHTML = '';

        if (diaData.ativo && Array.isArray(diaData.blocos) && diaData.blocos.length > 0) {
          diaData.blocos.forEach(bloco => adicionarBlocoDeHorario(dia.id, bloco.inicio, bloco.fim));
        } else if (diaData.ativo) {
          adicionarBlocoDeHorario(dia.id);
        }
      }

      ativoInput.dispatchEvent(new Event('change'));
    }
  });
}

/**
 * Gera a estrutura visual do formulário dos dias da semana.
 */
function gerarEstruturaDosDias() {
  const diasContainer = document.getElementById("dias-container");

  if (!diasContainer) return;

  diasContainer.innerHTML = '';

  diasDaSemana.forEach(dia => {
    const divDia = document.createElement('div');
    divDia.className = 'dia-semana';

    divDia.innerHTML = `
      <div class="dia-info">
        <span class="dia-nome">${dia.nome}</span>

        <div class="toggle-container">
          <label class="switch">
            <input type="checkbox" id="${dia.id}-ativo">
            <span class="slider"></span>
          </label>
          <span class="toggle-label">Fechado</span>
        </div>
      </div>

      <div class="horarios-container" style="display: none;" id="container-${dia.id}">
        <div class="horarios-blocos" id="blocos-${dia.id}"></div>
        <button type="button" class="btn-add-slot" data-dia="${dia.id}">
          + Adicionar Horário
        </button>
      </div>
    `;

    diasContainer.appendChild(divDia);

    const ativoInput = divDia.querySelector(`#${dia.id}-ativo`);

    if (ativoInput) {
      ativoInput.addEventListener('change', (e) => {
        const container = document.getElementById(`container-${dia.id}`);
        const label = e.target.closest('.toggle-container').querySelector('.toggle-label');

        if (container && label) {
          container.style.display = e.target.checked ? 'flex' : 'none';
          label.textContent = e.target.checked ? 'Aberto' : 'Fechado';

          if (
            e.target.checked &&
            container.querySelector('.horarios-blocos').childElementCount === 0
          ) {
            adicionarBlocoDeHorario(dia.id);
          }
        }
      });
    }
  });

  diasContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-add-slot')) {
      adicionarBlocoDeHorario(e.target.dataset.dia);
    }
  });
}

/**
 * Adiciona um bloco de horário no dia selecionado.
 */
function adicionarBlocoDeHorario(diaId, inicio = '09:00', fim = '18:00') {
  const container = document.getElementById(`blocos-${diaId}`);

  if (!container) return;

  const divBloco = document.createElement('div');
  divBloco.className = 'slot-horario bloco-horario';

  divBloco.innerHTML = `
    <input type="time" value="${inicio}">
    <span class="ate">até</span>
    <input type="time" value="${fim}">
    <button type="button" class="btn-remove-slot">Remover</button>
  `;

  container.appendChild(divBloco);

  const btnRemove = divBloco.querySelector('.btn-remove-slot');

  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      if (container.childElementCount > 1) {
        e.target.closest('.slot-horario').remove();
      } else {
        alert("Para não atender neste dia, desative o botão na parte superior.");
      }
    });
  }
}

/**
 * Trata o submit do formulário e grava os horários no Firestore.
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const btnSalvar = document.querySelector('button[type="submit"]');

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
  }

  const intervaloInput = document.getElementById("intervalo-atendimento");
  const checkMultiplo = document.getElementById("permitir-agendamento-multiplo");
  const capacidadeInput = document.getElementById("capacidade-pets-horario");

  const permitirAgendamentoMultiplo = !!checkMultiplo?.checked;

  let capacidadePetsPorHorario = Number(capacidadeInput?.value || 1);

  if (!permitirAgendamentoMultiplo) {
    capacidadePetsPorHorario = 1;
  }

  if (capacidadePetsPorHorario < 1) {
    capacidadePetsPorHorario = 1;
  }

  if (capacidadePetsPorHorario > 20) {
    capacidadePetsPorHorario = 20;
  }

  const horariosData = {
    intervalo: intervaloInput ? parseInt(intervaloInput.value, 10) : 30,

    permitirAgendamentoMultiplo,
    capacidadePetsPorHorario
  };

  diasDaSemana.forEach(dia => {
    const ativoInput = document.getElementById(`${dia.id}-ativo`);
    const estaAtivo = ativoInput ? ativoInput.checked : false;

    const blocos = [];

    if (estaAtivo) {
      document.querySelectorAll(`#blocos-${dia.id} .bloco-horario`).forEach(blocoEl => {
        const inputs = blocoEl.querySelectorAll('input[type="time"]');

        if (inputs[0]?.value && inputs[1]?.value) {
          blocos.push({
            inicio: inputs[0].value,
            fim: inputs[1].value
          });
        }
      });
    }

    horariosData[dia.id] = {
      ativo: estaAtivo,
      blocos: blocos
    };
  });

  try {
    console.log('Dados que serão salvos em horariosRef:', horariosData);

    await setDoc(horariosRef, horariosData, { merge: true });

    alert("Horários salvos com sucesso!");

  } catch (err) {
    console.error("Erro ao salvar:", err);
    alert("Erro ao salvar: " + err.message);

  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Horários";
    }
  }
}
