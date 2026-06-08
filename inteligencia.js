// Módulo de Inteligência para Resumo Diário
// Funcionalidades de análise inteligente dos agendamentos
// Adaptado para multiempresa: o contexto multiempresa deve ser garantido
// no momento de buscar os agendamentos (cada empresa possui sua própria lista do dia).

/**
 * Gera o resumo inteligente do dia para os agendamentos de UMA empresa.
 * @param {Array} agendamentos Lista de agendamentos da empresa ativa (já filtrados).
 * @returns {Object} Resumo inteligente do dia, incluindo mensagem formatada como lista HTML.
 */
export function gerarResumoDiarioInteligente(agendamentos) {
    if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
        return {
            totalAtendimentos: 0,
            atendimentosPendentes: 0,
            atendimentosRealizados: 0,
            faturamentoRealizado: 0,
            faturamentoPrevisto: 0,
            maiorIntervalo: null,
            primeiro: null,
            ultimo: null,
            mensagem: `<ul style="margin:0; padding-left: 1.1em; line-height: 1.7;">
                <li>Nenhum agendamento para hoje. Dia livre para outras atividades!</li>
            </ul>`
        };
    }

    // Ordenar agendamentos por horário de início
    const agendamentosOrdenados = agendamentos.slice().sort((a, b) => {
        const horaA = new Date(a.inicio).getTime();
        const horaB = new Date(b.inicio).getTime();
        return horaA - horaB;
    });

    const primeiro = agendamentosOrdenados[0];
    const ultimo = agendamentosOrdenados[agendamentosOrdenados.length - 1];

    // Totais e faturamento
    let atendimentosRealizados = 0;
    let atendimentosPendentes = 0;
    let faturamentoRealizado = 0;
    let faturamentoPrevisto = 0;

    agendamentos.forEach(ag => {
        const preco = Number(ag.servicoPreco || ag.preco || 50); // valor padrão
        faturamentoPrevisto += preco;

        if (["concluido", "finalizado"].includes((ag.status || "").toLowerCase())) {
            atendimentosRealizados++;
            faturamentoRealizado += preco;
        } else {
            atendimentosPendentes++;
        }
    });

    // Encontrar maior intervalo entre agendamentos
    let maiorIntervalo = null;
    if (agendamentosOrdenados.length > 1) {
        let maiorDuracao = 0;
        let intervaloInfo = null;

        for (let i = 0; i < agendamentosOrdenados.length - 1; i++) {
            const fimAtual = new Date(agendamentosOrdenados[i].fim);
            const inicioProximo = new Date(agendamentosOrdenados[i + 1].inicio);
            const duracaoMinutos = (inicioProximo - fimAtual) / (1000 * 60);

            if (duracaoMinutos > maiorDuracao) {
                maiorDuracao = duracaoMinutos;
                intervaloInfo = {
                    inicio: fimAtual.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                    fim: inicioProximo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                    duracaoMinutos: Math.round(duracaoMinutos)
                };
            }
        }

        if (maiorDuracao > 30) { // considera apenas intervalos maiores que 30min
            maiorIntervalo = intervaloInfo;
        }
    }

    // Geração de insights para a lista
    const insights = [];

    insights.push(`Você tem <strong>${agendamentos.length} agendamento${agendamentos.length > 1 ? "s" : ""}</strong> hoje: 
        <strong>${atendimentosRealizados}</strong> concluído${atendimentosRealizados !== 1 ? "s" : ""} e 
        <strong>${atendimentosPendentes}</strong> pendente${atendimentosPendentes !== 1 ? "s" : ""}.`);

    insights.push(`Início: <strong>${primeiro ? new Date(primeiro.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong>
        (${primeiro?.cliente || ""}${primeiro?.servico ? " - " + primeiro.servico : ""})`);

    insights.push(`Término: <strong>${ultimo ? new Date(ultimo.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong>
        (${ultimo?.cliente || ""}${ultimo?.servico ? " - " + ultimo.servico : ""})`);

    insights.push(`Faturamento realizado: <strong>${faturamentoRealizado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>. 
        Previsto: <strong>${faturamentoPrevisto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>.`);

    if (maiorIntervalo) {
        insights.push(
            `Maior intervalo livre: <strong>${maiorIntervalo.duracaoMinutos} minutos</strong> entre 
            <strong>${maiorIntervalo.inicio}</strong> e <strong>${maiorIntervalo.fim}</strong>.`
        );
    }

    return {
        totalAtendimentos: agendamentos.length,
        atendimentosPendentes,
        atendimentosRealizados,
        faturamentoRealizado,
        faturamentoPrevisto,
        primeiro: primeiro
            ? {
                  horario: new Date(primeiro.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                  cliente: primeiro.cliente,
                  servico: primeiro.servico
              }
            : null,
        ultimo: ultimo
            ? {
                  horario: new Date(ultimo.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                  cliente: ultimo.cliente,
                  servico: ultimo.servico
              }
            : null,
        maiorIntervalo,
        mensagem: `<ul style="margin:0; padding-left: 1.1em; line-height: 1.7;">${insights.map(i=>`<li>${i}</li>`).join('')}</ul>`
    };
}

/**
 * Gera sugestões inteligentes para o dia, considerando os agendamentos da empresa.
 * @param {Array} agendamentos Lista de agendamentos da empresa ativa.
 * @param {Object} configuracoes Configurações opcionais da empresa (ex: totalSlots).
 * @returns {Array} Lista de sugestões inteligentes.
 */
export function gerarSugestoesInteligentes(agendamentos, configuracoes = {}) {
    const sugestoes = [];

    if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
        sugestoes.push("Dia livre! Aproveite para organizar o espaço ou planejar promoções.");
        return sugestoes;
    }

    // Ocupação
    const totalSlots = configuracoes.totalSlots || 20;
    const ocupacao = (agendamentos.length / totalSlots) * 100;

    if (ocupacao < 30) {
        sugestoes.push("Baixa ocupação hoje. Considere enviar ofertas ou lembretes para clientes.");
    } else if (ocupacao > 80) {
        sugestoes.push("Dia muito movimentado! Prepare-se bem e lembre-se de se hidratar.");
    }

    // Intervalos
    const resumo = gerarResumoDiarioInteligente(agendamentos);
    if (resumo.maiorIntervalo && resumo.maiorIntervalo.duracaoMinutos > 60) {
        sugestoes.push(
            `Você tem ${resumo.maiorIntervalo.duracaoMinutos} minutos livres entre ${resumo.maiorIntervalo.inicio} e ${resumo.maiorIntervalo.fim}. Ótima oportunidade para descanso ou tarefas administrativas.`
        );
    }

    // Serviços populares
    const servicosContados = agendamentos.reduce((acc, ag) => {
        if (ag.servico) {
            acc[ag.servico] = (acc[ag.servico] || 0) + 1;
        }
        return acc;
    }, {});

    const servicoMaisPopular = Object.entries(servicosContados).sort((a, b) => b[1] - a[1])[0];

    if (servicoMaisPopular && servicoMaisPopular[1] > 1) {
        sugestoes.push(`${servicoMaisPopular[0]} está em alta hoje com ${servicoMaisPopular[1]} agendamentos!`);
    }

    return sugestoes.length > 0 ? sugestoes : ["Tenha um ótimo dia de trabalho!"];
}
