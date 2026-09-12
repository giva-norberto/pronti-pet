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

function resolverClienteId(currentUser) {
    return String(
        currentUser?.clienteId ||
        currentUser?.uid ||
        ""
    ).trim();
}

function resolverAuthUid(currentUser) {
    return String(
        currentUser?.authUid ||
        currentUser?.uid ||
        ""
    ).trim();
}

export async function profissionalTemAusencia(
    empresaId,
    profissionalId,
    dataYYYYMMDD
) {
    try {
        if (
            !empresaId ||
            !profissionalId ||
            !dataYYYYMMDD
        ) {
            return false;
        }

        const ausRef = collection(
            db,
            'empresarios',
            empresaId,
            'profissionais',
            profissionalId,
            'ausencias'
        );

        const q = query(
            ausRef,
            where(
                'data',
                '==',
                dataYYYYMMDD
            )
        );

        const snap = await getDocs(q);

        return !snap.empty;

    } catch (err) {
        console.warn(
            'Erro ao verificar ausência do profissional:',
            err
        );

        return false;
    }
}

async function clienteTemAssinaturaValida(
    empresaId,
    clienteId
) {
    try {
        const assinaturasRef = collection(
            db,
            "empresarios",
            empresaId,
            "clientes",
            clienteId,
            "assinaturas"
        );

        const q = query(
            assinaturasRef,
            where(
                "status",
                "==",
                "ativo"
            )
        );

        const snap = await getDocs(q);
        const agora = new Date();

        for (const docSnap of snap.docs) {
            const assinatura =
                docSnap.data();

            const dataFim =
                assinatura.dataFim?.toDate
                    ? assinatura.dataFim.toDate()
                    : new Date(
                        assinatura.dataFim
                    );

            if (dataFim > agora) {
                return true;
            }
        }

        return false;

    } catch (err) {
        console.warn(
            'Erro ao verificar assinatura válida do cliente:',
            err
        );

        return false;
    }
}

async function criarLembreteAutomatico(
    empresaId,
    agendamento,
    currentUser
) {
    try {
        const clienteId =
            resolverClienteId(currentUser);

        const clienteAuthUid =
            resolverAuthUid(currentUser);

        if (!clienteId) {
            console.warn(
                '⚠️ Lembrete não criado: cliente não identificado'
            );

            return;
        }

        const [ano, mes, dia] =
            agendamento.data
                .split('-')
                .map(Number);

        const [hora, minuto] =
            agendamento.horario
                .split(':')
                .map(Number);

        const dataAgendamento =
            new Date(
                ano,
                mes - 1,
                dia,
                hora,
                minuto
            );

        const dataLembrete =
            new Date(
                dataAgendamento.getTime() -
                60 * 60 * 1000
            );

        if (dataLembrete <= new Date()) {
            console.log(
                '⏰ Lembrete não criado: horário já passou'
            );

            return;
        }

        await addDoc(
            collection(
                db,
                'lembretesPendentes'
            ),
            {
                clienteId:
                    clienteId,

                clienteAuthUid:
                    clienteAuthUid ||
                    null,

                empresaId:
                    empresaId,

                servicoNome:
                    agendamento
                        .servico
                        .nome,

                profissionalNome:
                    agendamento
                        .profissional
                        .nome,

                dataAgendamento:
                    agendamento.data,

                horarioTexto:
                    agendamento.horario,

                dataEnvio:
                    Timestamp.fromDate(
                        dataLembrete
                    ),

                enviado:
                    false,

                criadoEm:
                    serverTimestamp()
            }
        );

        console.log(
            '✅ Lembrete automático criado para:',
            dataLembrete
        );

    } catch (error) {
        console.error(
            '❌ Erro ao criar lembrete automático:',
            error
        );
    }
}

export async function buscarAgendamentosDoDia(
    empresaId,
    data
) {
    try {
        const agendamentosRef = collection(
            db,
            'empresarios',
            empresaId,
            'agendamentos'
        );

        const q = query(
            agendamentosRef,
            where(
                "data",
                "==",
                data
            ),
            where(
                "status",
                "==",
                "ativo"
            )
        );

        const snapshot =
            await getDocs(q);

        return snapshot.docs.map(
            docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })
        );

    } catch (error) {
        console.error(
            "Erro ao buscar agendamentos do dia:",
            error
        );

        throw new Error(
            "Não foi possível buscar os agendamentos do dia."
        );
    }
}

export function calcularSlotsDisponiveis(
    data,
    agendamentosDoDia,
    horariosTrabalho,
    duracaoServico
) {
    const diaDaSemana = [
        'domingo',
        'segunda',
        'terca',
        'quarta',
        'quinta',
        'sexta',
        'sabado'
    ];

    const dataObj =
        new Date(
            `${data}T12:00:00Z`
        );

    const nomeDia =
        diaDaSemana[
            dataObj.getUTCDay()
        ];

    const diaDeTrabalho =
        horariosTrabalho?.[nomeDia];

    if (
        !diaDeTrabalho ||
        !diaDeTrabalho.ativo ||
        !diaDeTrabalho.blocos ||
        diaDeTrabalho.blocos.length === 0
    ) {
        return [];
    }

    const intervaloEntreSessoes =
        horariosTrabalho.intervalo ||
        0;

    const slotsDisponiveis = [];

    const horariosOcupados =
        agendamentosDoDia.map(
            agendamento => {
                const inicio =
                    timeStringToMinutes(
                        agendamento.horario
                    );

                const fim =
                    inicio +
                    agendamento.servicoDuracao;

                return {
                    inicio,
                    fim
                };
            }
        );

    const hoje = new Date();

    const ehHoje =
        getLocalYYYYMMDD(hoje) ===
        data;

    const minutosAgora =
        timeStringToMinutes(
            `${hoje
                .getHours()
                .toString()
                .padStart(
                    2,
                    '0'
                )}:${hoje
                    .getMinutes()
                    .toString()
                    .padStart(
                        2,
                        '0'
                    )}`
        );

    for (
        const bloco
        of diaDeTrabalho.blocos
    ) {
        let slotAtualEmMinutos =
            timeStringToMinutes(
                bloco.inicio
            );

        const fimDoBlocoEmMinutos =
            timeStringToMinutes(
                bloco.fim
            );

        while (
            slotAtualEmMinutos +
            duracaoServico <=
            fimDoBlocoEmMinutos
        ) {
            const fimDoSlotProposto =
                slotAtualEmMinutos +
                duracaoServico;

            const temConflito =
                horariosOcupados.some(
                    ocupado =>
                        slotAtualEmMinutos <
                            ocupado.fim &&
                        fimDoSlotProposto >
                            ocupado.inicio
                );

            if (
                !temConflito &&
                (
                    !ehHoje ||
                    slotAtualEmMinutos >
                        minutosAgora
                )
            ) {
                slotsDisponiveis.push(
                    minutesToTimeString(
                        slotAtualEmMinutos
                    )
                );
            }

            slotAtualEmMinutos +=
                intervaloEntreSessoes ||
                duracaoServico;
        }
    }

    return slotsDisponiveis;
}

export async function encontrarPrimeiraDataComSlots(
    empresaId,
    profissional,
    duracaoServico
) {
    const hoje = new Date();

    for (let i = 0; i < 90; i++) {
        const dataAtual =
            new Date(hoje);

        dataAtual.setDate(
            hoje.getDate() + i
        );

        const dataString =
            getLocalYYYYMMDD(
                dataAtual
            );

        const estaAusente =
            await profissionalTemAusencia(
                empresaId,
                profissional.id,
                dataString
            );

        if (estaAusente) {
            continue;
        }

        const agendamentos =
            await buscarAgendamentosDoDia(
                empresaId,
                dataString
            );

        const agendamentosProfissional =
            agendamentos.filter(
                agendamento =>
                    agendamento
                        .profissionalId ===
                    profissional.id
            );

        const slots =
            calcularSlotsDisponiveis(
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

export async function salvarAgendamento(
    empresaId,
    currentUser,
    agendamento
) {
    try {
        if (!empresaId) {
            throw new Error(
                "Empresa não identificada."
            );
        }

        if (!currentUser) {
            throw new Error(
                "Cliente não identificado."
            );
        }

        if (!agendamento) {
            throw new Error(
                "Dados do agendamento não encontrados."
            );
        }

        const clienteId =
            resolverClienteId(
                currentUser
            );

        const clienteAuthUid =
            resolverAuthUid(
                currentUser
            );

        if (!clienteId) {
            throw new Error(
                "Cadastro do cliente não identificado."
            );
        }

        let observacaoPet = "";
        let observacaoAgendamento = "";

        try {
            const dadosObservacaoPet =
                await validarObservacaoPetAntesDeAgendar(
                    empresaId,
                    clienteId
                );

            observacaoPet =
                dadosObservacaoPet
                    ?.observacaoPet ||
                "";

            observacaoAgendamento =
                dadosObservacaoPet
                    ?.observacaoAgendamento ||
                "";

            agendamento.observacaoPet =
                observacaoPet;

            agendamento.observacaoAgendamento =
                observacaoAgendamento;

        } catch (erroObservacaoPet) {
            console.warn(
                "⚠️ Não foi possível validar observação do pet antes de agendar:",
                erroObservacaoPet
            );

            observacaoPet =
                agendamento
                    ?.pet
                    ?.observacoes ||
                "";

            observacaoAgendamento = "";

            agendamento.observacaoPet =
                observacaoPet;

            agendamento.observacaoAgendamento =
                observacaoAgendamento;
        }

        if (
            window.solicitarPermissaoParaNotificacoes &&
            clienteAuthUid
        ) {
            console.log(
                "🔔 Solicitando/Atualizando token de notificação antes de salvar..."
            );

            (async () => {
                try {
                    await window
                        .solicitarPermissaoParaNotificacoes(
                            clienteAuthUid,
                            empresaId
                        );

                } catch (e) {
                    console.warn(
                        "⚠️ Falha ao solicitar token:",
                        e
                    );
                }
            })();
        }

        const agendamentosRef =
            collection(
                db,
                'empresarios',
                empresaId,
                'agendamentos'
            );

        const precoOriginal =
            agendamento
                ?.servico
                ?.precoOriginal != null

                ? Number(
                    agendamento
                        .servico
                        .precoOriginal
                )

                : agendamento
                    ?.servico
                    ?.preco != null

                    ? Number(
                        agendamento
                            .servico
                            .preco
                    )

                    : 0;

        let precoCobrado =
            precoOriginal;

        const temAssinaturaValida =
            await clienteTemAssinaturaValida(
                empresaId,
                clienteId
            );

        const servicoInclusoViaAssinatura =
            agendamento
                ?.servico
                ?.fazParteDaAssinatura ===
            true;

        if (
            temAssinaturaValida &&
            servicoInclusoViaAssinatura
        ) {
            precoCobrado = 0;
        }

        const payload = {
            empresaId:
                empresaId,

            clienteId:
                clienteId,

            clienteAuthUid:
                clienteAuthUid ||
                null,

            clienteNome:
                currentUser.displayName ||
                currentUser.email ||
                "Cliente",

            clienteFoto:
                currentUser.photoURL ||
                "",

            profissionalId:
                agendamento
                    .profissional
                    .id,

            profissionalNome:
                agendamento
                    .profissional
                    .nome,

            servicoId:
                agendamento
                    .servico
                    .id,

            servicoNome:
                agendamento
                    .servico
                    .nome,

            servicoDuracao:
                agendamento
                    .servico
                    .duracao,

            servicoPrecoOriginal:
                precoOriginal,

            servicoPrecoCobrado:
                precoCobrado,

            petId:
                agendamento
                    .pet
                    ?.id ||
                null,

            petNome:
                agendamento
                    .pet
                    ?.nome ||
                "",

            petPorte:
                agendamento
                    .pet
                    ?.porte ||
                "",

            petFotoUrl:
                agendamento
                    .pet
                    ?.fotoUrl ||
                "",

            petFotoPath:
                agendamento
                    .pet
                    ?.fotoPath ||
                "",

            observacaoPet:
                observacaoPet ||
                "",

            observacaoAgendamento:
                observacaoAgendamento ||
                "",

            data:
                agendamento.data,

            horario:
                agendamento.horario,

            status:
                'ativo',

            criadoEm:
                serverTimestamp()
        };

        if (
            agendamento.assinaturaConsumo &&
            temAssinaturaValida
        ) {
            payload.assinaturaConsumo =
                agendamento
                    .assinaturaConsumo;

            payload.origemPagamento =
                'assinatura';
        }

        await addDoc(
            agendamentosRef,
            payload
        );

        await criarLembreteAutomatico(
            empresaId,
            agendamento,
            currentUser
        );

        if (
            agendamento.empresa &&
            agendamento.empresa.donoId
        ) {
            try {
                const filaRef =
                    collection(
                        db,
                        "filaDeNotificacoes"
                    );

                const mensagemObservacaoPet =
                    observacaoPet
                        ? ` Observação do pet: ${observacaoPet}`
                        : "";

                const mensagemObservacaoAgendamento =
                    observacaoAgendamento
                        ? ` Observação do atendimento: ${observacaoAgendamento}`
                        : "";

                await addDoc(
                    filaRef,
                    {
                        donoId:
                            agendamento
                                .empresa
                                .donoId,

                        titulo:
                            "🎉 Novo Agendamento!",

                        mensagem:
                            `${
                                currentUser.displayName ||
                                currentUser.email ||
                                "Cliente"
                            } agendou ${
                                agendamento
                                    .servico
                                    .nome
                            }${
                                agendamento.pet?.nome
                                    ? ` para ${agendamento.pet.nome}`
                                    : ""
                            } com ${
                                agendamento
                                    .profissional
                                    .nome
                            } às ${
                                agendamento.horario
                            }.${
                                mensagemObservacaoPet
                            }${
                                mensagemObservacaoAgendamento
                            }`,

                        criadoEm:
                            serverTimestamp(),

                        status:
                            "pendente"
                    }
                );

            } catch (error) {
                console.error(
                    "❌ Erro ao adicionar notificação à fila:",
                    error
                );
            }

        } else {
            console.warn(
                "AVISO: donoId não foi passado para salvarAgendamento."
            );
        }

        if (
            typeof limparUIAgendamento ===
            "function"
        ) {
            limparUIAgendamento();
        }

    } catch (error) {
        console.error(
            "Erro principal ao salvar agendamento:",
            error
        );

        throw new Error(
            'Ocorreu um erro ao confirmar seu agendamento.'
        );
    }
}

export async function buscarAgendamentosDoCliente(
    empresaId,
    currentUser,
    modo
) {
    if (!currentUser) {
        return [];
    }

    const clienteId =
        resolverClienteId(
            currentUser
        );

    if (!clienteId) {
        return [];
    }

    try {
        const agendamentosRef =
            collection(
                db,
                'empresarios',
                empresaId,
                'agendamentos'
            );

        const hoje =
            getLocalYYYYMMDD();

        let q;

        if (modo === 'ativos') {
            q = query(
                agendamentosRef,

                where(
                    "clienteId",
                    "==",
                    clienteId
                ),

                where(
                    "status",
                    "==",
                    "ativo"
                ),

                where(
                    "data",
                    ">=",
                    hoje
                )
            );

        } else {
            q = query(
                agendamentosRef,

                where(
                    "clienteId",
                    "==",
                    clienteId
                ),

                where(
                    "status",
                    "in",
                    [
                        "realizado",
                        "cancelado",
                        "cancelado_pelo_cliente",
                        "cancelado_pelo_gestor",
                        "nao_compareceu"
                    ]
                )
            );
        }

        const snapshot =
            await getDocs(q);

        return snapshot.docs.map(
            docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })
        );

    } catch (error) {
        console.error(
            "Erro ao buscar agendamentos do cliente:",
            error
        );

        if (
            error.code ===
                'failed-precondition' &&
            error.message.includes(
                "The query requires an index"
            )
        ) {
            throw new Error(
                "Ocorreu um erro ao buscar seus agendamentos. A configuração do banco de dados pode estar incompleta."
            );
        }

        throw error;
    }
}

export async function cancelarAgendamento(
    empresaId,
    agendamentoId
) {
    try {
        const agendamentoRef = doc(
            db,
            'empresarios',
            empresaId,
            'agendamentos',
            agendamentoId
        );

        const agendamentoSnap =
            await getDoc(
                agendamentoRef
            );

        if (!agendamentoSnap.exists()) {
            throw new Error(
                "Agendamento não encontrado."
            );
        }

        const agendamento =
            agendamentoSnap.data();

        await updateDoc(
            agendamentoRef,
            {
                status:
                    'cancelado_pelo_cliente',

                canceladoEm:
                    serverTimestamp()
            }
        );

        try {
            const resFila =
                await ofertarVagaParaFila(
                    empresaId,
                    {
                        data:
                            agendamento.data,

                        horario:
                            agendamento.horario,

                        profissionalId:
                            agendamento
                                .profissionalId ||
                            null,

                        profissionalNome:
                            agendamento
                                .profissionalNome ||
                            "",

                        servicoId:
                            agendamento
                                .servicoId,

                        servicoNome:
                            agendamento
                                .servicoNome ||
                            ""
                    }
                );

            console.log(
                "Resultado da fila inteligente após cancelamento:",
                resFila
            );

        } catch (erroFila) {
            console.warn(
                "Erro ao tentar ofertar vaga para a fila após cancelamento:",
                erroFila
            );
        }

    } catch (error) {
        console.error(
            "Erro ao cancelar agendamento:",
            error
        );

        throw new Error(
            "Ocorreu um erro ao cancelar o agendamento."
        );
    }
}
