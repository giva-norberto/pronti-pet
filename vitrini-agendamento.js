export * from './vitrini-agendamento-core.js';

import {
    profissionalTemAusencia as profissionalTemAusenciaCore,
    calcularSlotsDisponiveis
} from './vitrini-agendamento-core.js';

const URL_DISPONIBILIDADE_PUBLICA =
    'https://southamerica-east1-pronti-pet.cloudfunctions.net/buscarDisponibilidadePublica';

function getLocalYYYYMMDDSeguro(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export async function buscarAgendamentosDoDia(
    empresaId,
    data
) {
    try {
        if (!empresaId || !/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) {
            throw new Error('Empresa ou data inválida.');
        }

        const resposta = await fetch(
            URL_DISPONIBILIDADE_PUBLICA,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    empresaId,
                    data
                })
            }
        );

        if (!resposta.ok) {
            throw new Error(
                `Falha ao consultar disponibilidade: ${resposta.status}`
            );
        }

        const dados = await resposta.json();

        return Array.isArray(dados?.agendamentos)
            ? dados.agendamentos
            : [];

    } catch (error) {
        console.error(
            'Erro ao buscar disponibilidade do dia:',
            error
        );

        throw new Error(
            'Não foi possível buscar os horários disponíveis.'
        );
    }
}

export async function encontrarPrimeiraDataComSlots(
    empresaId,
    profissional,
    duracaoServico
) {
    const hoje = new Date();

    for (let i = 0; i < 90; i++) {
        const dataAtual = new Date(hoje);
        dataAtual.setDate(hoje.getDate() + i);

        const dataString =
            getLocalYYYYMMDDSeguro(dataAtual);

        const estaAusente =
            await profissionalTemAusenciaCore(
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
                    agendamento.profissionalId === profissional.id
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
