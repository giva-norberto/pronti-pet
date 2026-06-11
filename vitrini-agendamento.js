import { db } from './vitrini-firebase.js';
import { ofertarVagaParaFila } from './filaInteligenteEngine.js';
import { validarObservacaoPetAntesDeAgendar } from './vitrine-pets-observacoes.js';

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

function timeStringToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function getLocalYYYYMMDD(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

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

async function clienteTemAssinaturaValida(empresaId, clienteId) {
    try {
        const assinaturasRef = collection(db, "empresarios", empresaId, "clientes", clienteId, "assinaturas");
        const q = query(assinaturasRef, where("status", "==", "ativo"));
        const snap = await getDocs(q);
        const agora = new Date();

        for (const docSnap of snap.docs) {
            const assinatura = docSnap.data();
            const dataFim = assinatura.dataFim?.toDate
                ? assinatura.dataFim.toDate()
                : new Date(assinatura.dataFim);

            if (dataFim > agora) return true;
        }

        return false;
    } catch (err) {
        console.warn('Erro ao verificar assinatura válida do cliente:', err);
        return false;
    }
}

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

        await addDoc(collection(db, 'lembretesPendentes'), {
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
        console.error('❌ Erro ao criar lembrete automático:', error);
    }
}

export async function buscarAgendamentosDoDia(empresaId, data) {
    try {
        const agendamentosRef = collection(db, 'empresarios', empresaId, 'agendamentos');

        const q = query(
            agendamentosRef,
            where("data", "==", data),
            where("status", "==", "ativo")
        );

        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
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

            const temConflito = horariosOcupados.some(ocupado =>
                slotAtualEmMinutos < ocupado.fim &&
                fimDoSlotProposto > ocupado.inicio
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

        if (slots.length > 0) return dataString;
    }

    return null;
}

async function enviarEmailViaPHP(agendamento, currentUser) {
    try {
        const emailCliente = currentUser?.email;
        const observacaoPetHtml = agendamento.observacaoPet
            ? `<p><strong>Observação do Pet:</strong> ${agendamento.observacaoPet}</p>`
            : "";

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
                            <p>Pet: ${agendamento.pet?.nome || ''}</p>
                            <p>Porte: ${agendamento.pet?.porte || ''}</p>
                            ${observacaoPetHtml}
                            <p>Serviço: ${agendamento.servico?.nome || ''}</p>
                            <p>Profissional: ${agendamento.profissional?.nome || ''}</p>
                            <p>Data: ${agendamento.data || ''} às ${agendamento.horario || ''}</p>
                        `
                    })
                });

                console.log('✅ Solicitação de envio PHP para o cliente feita.');
            } catch (err) {
                console.warn('Falha ao solicitar envio PHP para o cliente:', err);
            }
        }

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
                            <p>Pet: ${agendamento.pet?.nome || ''}</p>
                            <p>Porte: ${agendamento.pet?.porte || ''}</p>
                            ${observacaoPetHtml}
                            <p>Serviço: ${agendamento.servico?.nome || ''}</p>
                            <p>Profissional: ${agendamento.profissional?.nome || ''}</p>
                            <p>Data: ${agendamento.data || ''} às ${agendamento.horario || ''}</p>
                        `
                    })
                });

                console.log('✅ Solicitação de envio PHP para o dono feita.');
            } catch (err) {
                console.warn('Falha ao solicitar envio PHP para o dono:', err);
            }
        }
    } catch (err) {
        console.error('Erro inesperado em enviarEmailViaPHP:', err);
    }
}

export async function salvarAgendamento(empresaId, currentUser, agendamento) {
    try {
        if (!empresaId) {
            throw new Error("Empresa não identificada.");
        }

        if (!currentUser) {
            throw new Error("Cliente não identificado.");
        }

        if (!agendamento) {
            throw new Error("Dados do agendamento não encontrados.");
        }

        let observacaoPet = "";

        try {
            const dadosObservacaoPet = await validarObservacaoPetAntesDeAgendar(empresaId, currentUser);
            observacaoPet = dadosObservacaoPet?.observacaoPet || "";
            agendamento.observacaoPet = observacaoPet;
        } catch (erroObservacaoPet) {
            console.warn("⚠️ Não foi possível validar observação do pet antes de agendar:", erroObservacaoPet);
            observacaoPet = agendamento?.pet?.observacoes || "";
            agendamento.observacaoPet = observacaoPet;
        }

        if (window.solicitarPermissaoParaNotificacoes) {
            console.log("🔔 Solicitando/Atualizando token de notificação antes de salvar...");

            (async () => {
                try {
                    await window.solicitarPermissaoParaNotificacoes(currentUser.uid, empresaId);
                } catch (e) {
                    console.warn("⚠️ Falha ao solicitar token:", e);
                }
            })();
        }

        const agendamentosRef = collection(db, 'empresarios', empresaId, 'agendamentos');

        const precoOriginal = agendamento?.servico?.precoOriginal != null
            ? Number(agendamento.servico.precoOriginal)
            : agendamento?.servico?.preco != null
                ? Number(agendamento.servico.preco)
                : 0;

        let precoCobrado = precoOriginal;

        const temAssinaturaValida = await clienteTemAssinaturaValida(empresaId, currentUser.uid);
        const servicoInclusoViaAssinatura = agendamento?.servico?.fazParteDaAssinatura === true;

        if (temAssinaturaValida && servicoInclusoViaAssinatura) {
            precoCobrado = 0;
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

            petId: agendamento.pet?.id || null,
            petNome: agendamento.pet?.nome || "",
            petPorte: agendamento.pet?.porte || "",
            observacaoPet: observacaoPet || "",

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

        await criarLembreteAutomatico(empresaId, agendamento, currentUser);

        if (agendamento.empresa && agendamento.empresa.donoId) {
            try {
                const filaRef = collection(db, "filaDeNotificacoes");

                const mensagemObservacao = observacaoPet
                    ? ` Observação do pet: ${observacaoPet}`
                    : "";

                await addDoc(filaRef, {
                    donoId: agendamento.empresa.donoId,
                    titulo: "🎉 Novo Agendamento!",
                    mensagem: `${currentUser.displayName} agendou ${agendamento.servico.nome}${agendamento.pet?.nome ? ` para ${agendamento.pet.nome}` : ""} com ${agendamento.profissional.nome} às ${agendamento.horario}.${mensagemObservacao}`,
                    criadoEm: serverTimestamp(),
                    status: "pendente"
                });
            } catch (error) {
                console.error("❌ Erro ao adicionar notificação à fila:", error);
            }
        } else {
            console.warn("AVISO: donoId não foi passado para salvarAgendamento.");
        }

        (async () => {
            try {
                await enviarEmailViaPHP(agendamento, currentUser);
            } catch (e) {
                console.warn('Falha no envio via PHP:', e);
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

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Erro ao buscar agendamentos do cliente:", error);

        if (
            error.code === 'failed-precondition' &&
            error.message.includes("The query requires an index")
        ) {
            throw new Error("Ocorreu um erro ao buscar seus agendamentos. A configuração do banco de dados pode estar incompleta.");
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
