// ======================================================================
// vitrini-agendamento.js (REVISADO PARA RESPEITAR AUSÊNCIAS DO PROFISSIONAL)
// ======================================================================

/*
  Alterações mínimas:
  - adicionada função profissionalTemAusencia(empresaId, profissionalId, data)
  - encontrarPrimeiraDataComSlots agora pula datas em que o profissional tem ausência
  - sem alterar a lógica de cálculo de slots (calcularSlotsDisponiveis)
  - ✅ Adicionado: verificação da assinatura do cliente APENAS para ajuste do preço cobrado do serviço (não bloqueia agendamento)
  - ✅ Adicionada função enviarEmailViaPHP(...) como utilitário; chamada ao envio foi alterada para usá-la em background,
    mantendo todo o restante da lógica exatamente igual.
  - ✅ Adicionado: Chamada ao serviço de notificações no ato do salvamento para geração do token FCM.
*/

import { db } from './vitrini-firebase.js';
import { ofertarVagaParaFila } from './filaInteligenteEngine.js';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp,
    getDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { limparUIAgendamento } from './vitrini-ui.js';

// --- Funções Auxiliares de Tempo (LÓGICA 100% PRESERVADA) ---
function timeStringToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// --- Função utilitária pequena e segura para gerar 'YYYY-MM-DD' no fuso LOCAL ---
function getLocalYYYYMMDD(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// -------------------------------------------------------------------------
// Nova função: verifica se há ausência registrada para o profissional numa data
// -------------------------------------------------------------------------
export async function profissionalTemAusencia(empresaId, profissionalId, dataYYYYMMDD) {
    try {
        if (!empresaId || !profissionalId || !dataYYYYMMDD) return false;
        const ausRef = collection(db, 'empresarios', empresaId, 'profissionais', profissionalId, 'ausencias');
        const q = query(ausRef, where('data', '==', dataYYYYMMDD));
        const snap = await getDocs(q);
        return !snap.empty;
    } catch (err) {
        console.warn('Erro ao verificar ausência do profissional:', err);
        return false;
    }
}

// --- NOVA FUNÇÃO: Verifica se o cliente tem assinatura válida
async function clienteTemAssinaturaValida(empresaId, clienteId) {
    try {
        const assinaturasRef = collection(db, "empresarios", empresaId, "clientes", clienteId, "assinaturas");
        const q = query(assinaturasRef, where("status", "==", "ativo"));
        const snap = await getDocs(q);
        const agora = new Date();
        for (const docSnap of snap.docs) {
            const assinatura = docSnap.data();
            const dataFim = assinatura.dataFim?.toDate ? assinatura.dataFim.toDate() : new Date(assinatura.dataFim);
            if (dataFim > agora) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.warn('Erro ao verificar assinatura válida do cliente:', err);
        return false;
    }
}

// ======================================================================
// 🆕 NOVA FUNÇÃO: Criar lembrete automático (1 hora antes do agendamento)
// ======================================================================
async function criarLembreteAutomatico(empresaId, agendamento, currentUser) {
    try {
        const [ano, mes, dia] = agendamento.data.split('-').map(Number);
        const [hora, minuto] = agendamento.horario.split(':').map(Number);

        const dataAgendamento = new Date(ano, mes - 1, dia, hora, minuto);
        const dataLembrete = new Date(dataAgendamento.getTime() - 60 * 60 * 1000);

        if (dataLembrete <= new Date()) {
            console.log('⏰ Lembrete não criado: horário já passou');
            return;
        }

        const lembreteRef = collection(db, 'lembretesPendentes');

        await addDoc(lembreteRef, {
            clienteId: currentUser.uid,
            empresaId: empresaId,
            servicoNome: agendamento.servico.nome,
            profissionalNome: agendamento.profissional.nome,
            dataAgendamento: agendamento.data,
            horarioTexto: agendamento.horario,
            dataEnvio: Timestamp.fromDate(dataLembrete),
            enviado: false,
            criadoEm: serverTimestamp()
        });

        console.log('✅ Lembrete automático criado para:', dataLembrete);
    } catch (error) {
        console.error('❌ Erro ao criar lembrete automático (não bloqueia agendamento):', error);
    }
}

// --- Funções Principais de Agendamento ---
export async function buscarAgendamentosDoDia(empresaId, data) {
    try {
        const agendamentosRef = collection(db, 'empresarios', empresaId, 'agendamentos');
        const q = query(
            agendamentosRef,
            where("data", "==", data),
            where("status", "==", "ativo")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar agendamentos do dia:", error);
        throw new Error("Não foi possível buscar os agendamentos do dia.");
    }
}

export function calcularSlotsDisponiveis(data, agendamentosDoDia, horariosTrabalho, duracaoServico) {
    const diaDaSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dataObj = new Date(`${data}T12:00:00Z`);
    const nomeDia = diaDaSemana[dataObj.getUTCDay()];

    const diaDeTrabalho = horariosTrabalho?.[nomeDia];
    if (!diaDeTrabalho || !diaDeTrabalho.ativo || !diaDeTrabalho.blocos || diaDeTrabalho.blocos.length === 0) {
        return [];
    }

    const intervaloEntreSessoes = horariosTrabalho.intervalo || 0;
    const slotsDisponiveis = [];

    const horariosOcupados = agendamentosDoDia.map(ag => {
        const inicio = timeStringToMinutes(ag.horario);
        const fim = inicio + ag.servicoDuracao;
        return { inicio, fim };
    });

    const hoje = new Date();
    const ehHoje = getLocalYYYYMMDD(hoje) === data;
    const minutosAgora = timeStringToMinutes(
        `${hoje.getHours().toString().padStart(2, '0')}:${hoje.getMinutes().toString().padStart(2, '0')}`
    );

    for (const bloco of diaDeTrabalho.blocos) {
        let slotAtualEmMinutos = timeStringToMinutes(bloco.inicio);
        const fimDoBlocoEmMinutos = timeStringToMinutes(bloco.fim);

        while (slotAtualEmMinutos + duracaoServico <= fimDoBlocoEmMinutos) {
            const fimDoSlotProposto = slotAtualEmMinutos + duracaoServico;
            let temConflito = horariosOcupados.some(ocupado =>
                slotAtualEmMinutos < ocupado.fim && fimDoSlotProposto > ocupado.inicio
            );

            if (!temConflito && (!ehHoje || slotAtualEmMinutos > minutosAgora)) {
                slotsDisponiveis.push(minutesToTimeString(slotAtualEmMinutos));
            }
            slotAtualEmMinutos += intervaloEntreSessoes || duracaoServico;
        }
    }
    return slotsDisponiveis;
}

export async function encontrarPrimeiraDataComSlots(empresaId, profissional, duracaoServico) {
    const hoje = new Date();
    for (let i = 0; i < 90; i++) {
        const dataAtual = new Date(hoje);
        dataAtual.setDate(hoje.getDate() + i);
        const dataString = getLocalYYYYMMDD(dataAtual);

        const estaAusente = await profissionalTemAusencia(empresaId, profissional.id, dataString);
        if (estaAusente) continue;

        const agendamentos = await buscarAgendamentosDoDia(empresaId, dataString);
        const agendamentosProfissional = agendamentos.filter(ag => ag.profissionalId === profissional.id);

        const slots = calcularSlotsDisponiveis(
            dataString,
            agendamentosProfissional,
            profissional.horarios,
            duracaoServico
        );

        if (slots.length > 0) {
            return dataString;
        }
    }
    return null;
}

// ======================================================================
// 🔔 Função de envio de e-mail (fila "mail")
// ======================================================================
async function enviarEmailNotificacao(agendamento, currentUser) {
    console.log("Tentando enviar e-mail...");

    try {
        const emailDoDono = agendamento?.empresa?.emailDeNotificacao;

        if (!emailDoDono) {
            console.warn("⚠️ E-mail do dono (emailDeNotificacao) não encontrado no documento da empresa. E-mail não enviado.");
            return;
        }

        await addDoc(collection(db, "mail"), {
            to: emailDoDono,
            template: {
                name: 'novoAgendamento',
                data: {
                    nomeCliente: currentUser.displayName || currentUser.email,
                    servicoNome: agendamento.servico.nome,
                    dataAgendamento: agendamento.data,
                    horarioAgendamento: agendamento.horario,
                    profissionalNome: agendamento.profissional.nome,
                    nomeEmpresa: agendamento.empresa.nomeFantasia
                }
            }
        });

        console.log("✅ E-mail para o dono adicionado à fila.");

    } catch (error) {
        console.error("❌ Erro no processo de envio de e-mail:", error);
    }
}

// ======================================================================
// 🔔 Função opcional: envio direto via seu endpoint PHP (NÃO chamada por padrão)
// ======================================================================
async function enviarEmailViaPHP(agendamento, currentUser) {
    try {
        // Envia para o cliente (se disponível)
        const emailCliente = currentUser?.email;
        if (emailCliente) {
            try {
                await fetch('/enviar-email.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        to: emailCliente,
                        subject: "Seu Agendamento foi Confirmado",
                        message: `
                            <h2>Agendamento Confirmado!</h2>
                            <p>Serviço: ${agendamento.servico?.nome || ''}</p>
                            <p>Profissional: ${agendamento.profissional?.nome || ''}</p>
                            <p>Data: ${agendamento.data || ''} às ${agendamento.horario || ''}</p>
                        `
                    })
                });
                console.log('✅ Solicitação de envio (PHP) para o cliente feita.');
            } catch (err) {
                console.warn('Falha ao solicitar envio (PHP) para o cliente:', err);
            }
        }

        // Envia para o dono/empresa (se disponível)
        const emailDoDono = agendamento?.empresa?.emailDeNotificacao;
        if (emailDoDono) {
            try {
                await fetch('/enviar-email.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        to: emailDoDono,
                        subject: "Novo Agendamento Recebido!",
                        message: `
                            <h2>Novo Agendamento!</h2>
                            <p>Cliente: ${currentUser?.displayName || currentUser?.email || ''}</p>
                            <p>Serviço: ${agendamento.servico?.nome || ''}</p>
                            <p>Data: ${agendamento.data || ''} às ${agendamento.horario || ''}</p>
                        `
                    })
                });
                console.log('✅ Solicitação de envio (PHP) para o dono feita.');
            } catch (err) {
                console.warn('Falha ao solicitar envio (PHP) para o dono:', err);
            }
        }
    } catch (err) {
        console.error('Erro inesperado em enviarEmailViaPHP:', err);
    }
}

// ======================================================================
// 🔧 Lógica principal de salvamento de agendamento (COM NOTIFICAÇÕES)
// ======================================================================
export async function salvarAgendamento(empresaId, currentUser, agendamento) {
    try {
        if (window.solicitarPermissaoParaNotificacoes) {
            console.log("🔔 Solicitando/Atualizando token de notificação antes de salvar (em background)...");
            (async () => {
                try {
                    await window.solicitarPermissaoParaNotificacoes(currentUser.uid, empresaId);
                } catch (e) {
                    console.warn("⚠️ Falha ao solicitar token (não bloqueia agendamento):", e);
                }
            })();
        }

        const agendamentosRef = collection(db, 'empresarios', empresaId, 'agendamentos');

        const precoOriginal = agendamento?.servico?.precoOriginal != null
            ? Number(agendamento.servico.precoOriginal)
            : (agendamento?.servico?.preco != null ? Number(agendamento.servico.preco) : 0);

        let precoCobrado = precoOriginal;

        const temAssinaturaValida = await clienteTemAssinaturaValida(empresaId, currentUser.uid);
        const servicoInclusoViaAssinatura = agendamento?.servico?.fazParteDaAssinatura === true;

        if (temAssinaturaValida && servicoInclusoViaAssinatura) {
            precoCobrado = 0;
        } else {
            precoCobrado = precoOriginal;
        }

        const payload = {
            empresaId: empresaId,
            clienteId: currentUser.uid,
            clienteNome: currentUser.displayName,
            clienteFoto: currentUser.photoURL,
            profissionalId: agendamento.profissional.id,
            profissionalNome: agendamento.profissional.nome,
            servicoId: agendamento.servico.id,
            servicoNome: agendamento.servico.nome,
            servicoDuracao: agendamento.servico.duracao,
            servicoPrecoOriginal: precoOriginal,
            servicoPrecoCobrado: precoCobrado,
            data: agendamento.data,
            horario: agendamento.horario,
            status: 'ativo',
            criadoEm: serverTimestamp()
        };

        if (agendamento.assinaturaConsumo && temAssinaturaValida) {
            payload.assinaturaConsumo = agendamento.assinaturaConsumo;
            payload.origemPagamento = 'assinatura';
        }

        await addDoc(agendamentosRef, payload);

        // ✨ NOVO: Criar lembrete automático
        await criarLembreteAutomatico(empresaId, agendamento, currentUser);

        if (agendamento.empresa && agendamento.empresa.donoId) {
            try {
                const filaRef = collection(db, "filaDeNotificacoes");

                // Apenas o dono recebe a notificação instantânea agora!
                await addDoc(filaRef, {
                    donoId: agendamento.empresa.donoId,
                    titulo: "🎉 Novo Agendamento!",
                    mensagem: `${currentUser.displayName} agendou ${agendamento.servico.nome} com ${agendamento.profissional.nome} às ${agendamento.horario}.`,
                    criadoEm: serverTimestamp(),
                    status: "pendente"
                });

                // REMOVIDO: notificação duplicada para o cliente (o push do cliente vai pelo lembrete)
                // (Nada além disso foi alterado.)

            } catch (error) {
                console.error("❌ Erro ao adicionar notificações à fila:", error);
            }
        } else {
            console.warn("AVISO: 'donoId' não foi passado para salvarAgendamento. O bilhete de notificação não foi criado.");
        }

        (async () => {
            try {
                await enviarEmailViaPHP(agendamento, currentUser);
            } catch (e) {
                console.warn('Falha no envio via PHP em background:', e);
            }
        })();

        if (typeof limparUIAgendamento === "function") {
            limparUIAgendamento();
        }

    } catch (error) {
        console.error("Erro principal ao salvar agendamento:", error);
        throw new Error('Ocorreu um erro ao confirmar seu agendamento.');
    }
}

// --- Funções de busca e cancelamento ---
export async function buscarAgendamentosDoCliente(empresaId, currentUser, modo) {
    if (!currentUser) return [];
    try {
        const agendamentosRef = collection(db, 'empresarios', empresaId, 'agendamentos');
        const hoje = getLocalYYYYMMDD();

        let q;
        if (modo === 'ativos') {
            q = query(
                agendamentosRef,
                where("clienteId", "==", currentUser.uid),
                where("status", "==", "ativo"),
                where("data", ">=", hoje)
            );
        } else {
            q = query(
                agendamentosRef,
                where("clienteId", "==", currentUser.uid),
                where("data", "<", hoje)
            );
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar agendamentos do cliente:", error);
        if (error.code === 'failed-precondition' && error.message.includes("The query requires an index")) {
            throw new Error("Ocorreu um erro ao buscar seus agendamentos. A configuração do banco de dados pode estar incompleta (índice composto).");
        }
        throw error;
    }
}

export async function cancelarAgendamento(empresaId, agendamentoId) {
    try {
        const agendamentoRef = doc(db, 'empresarios', empresaId, 'agendamentos', agendamentoId);
        const agendamentoSnap = await getDoc(agendamentoRef);

        if (!agendamentoSnap.exists()) {
            throw new Error("Agendamento não encontrado.");
        }

        const agendamento = agendamentoSnap.data();

        await updateDoc(agendamentoRef, {
            status: 'cancelado_pelo_cliente',
            canceladoEm: serverTimestamp()
        });

        try {
            const resFila = await ofertarVagaParaFila(empresaId, {
                data: agendamento.data,
                horario: agendamento.horario,
                profissionalId: agendamento.profissionalId || null,
                profissionalNome: agendamento.profissionalNome || "",
                servicoId: agendamento.servicoId,
                servicoNome: agendamento.servicoNome || ""
            });

            console.log("Resultado da fila inteligente após cancelamento:", resFila);
        } catch (erroFila) {
            console.warn("Erro ao tentar ofertar vaga para a fila após cancelamento:", erroFila);
        }
    } catch (error) {
        console.error("Erro ao cancelar agendamento:", error);
        throw new Error("Ocorreu um erro ao cancelar o agendamento.");
    }
}
