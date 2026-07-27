// vitrine-assinatura-integration.js
// Integração para detectar assinaturas do cliente
// e marcar serviços incluídos na vitrine.
//
// Compatibilidade:
// - Fluxo antigo: usa auth.currentUser.uid;
// - Novo fluxo: aceita o clienteId real do Firestore.
//
// Mantenha este arquivo na mesma pasta do vitrine.html.

import {
    db,
    auth
} from "./vitrini-firebase.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// ======================================================================
// Resolver o ID real do cliente
//
// Aceita:
// - clienteId como string;
// - objeto contendo clienteId;
// - objeto Firebase Auth contendo uid;
// - fallback para auth.currentUser.uid.
// ======================================================================

function resolverClienteId(clienteIdOuUsuario = null) {
    if (typeof clienteIdOuUsuario === "string") {
        return clienteIdOuUsuario.trim();
    }

    if (
        clienteIdOuUsuario &&
        typeof clienteIdOuUsuario === "object"
    ) {
        return String(
            clienteIdOuUsuario.clienteId ||
            clienteIdOuUsuario.id ||
            clienteIdOuUsuario.uid ||
            ""
        ).trim();
    }

    return String(
        auth.currentUser?.uid || ""
    ).trim();
}

// ======================================================================
// Limpar marcações de assinatura dos serviços
// ======================================================================

function limparAssinaturasDaListaServicos(listaServicos = []) {
    if (!Array.isArray(listaServicos)) {
        return;
    }

    listaServicos.forEach((servico) => {
        servico.fazParteDaAssinatura = false;
        servico.inclusoAssinatura = false;

        if (servico.precoOriginal != null) {
            servico.precoCobrado =
                Number(servico.precoOriginal);
        } else if (servico.preco != null) {
            servico.precoOriginal =
                Number(servico.preco);

            servico.precoCobrado =
                Number(servico.preco);
        } else if (servico.precoCobrado === 0) {
            delete servico.precoCobrado;
        }

        delete servico.assinaturasCandidatas;
    });
}

/**
 * construirMapaServicosPorAssinatura(clienteId, empresaId)
 *
 * Retorna:
 *
 * {
 *   [servicoId]: {
 *     totalDisponivel: Number | Infinity,
 *     assinaturas: [
 *       {
 *         assinaturaId,
 *         quantidadeRestante,
 *         planoNome,
 *         dataFim
 *       }
 *     ]
 *   }
 * }
 *
 * Regras:
 * - considera apenas assinaturas com status "ativo";
 * - ignora assinaturas expiradas;
 * - quantidadeRestante igual a zero representa uso ilimitado;
 * - aceita o clienteId real do documento Firestore.
 */

export async function construirMapaServicosPorAssinatura(
    clienteIdOuUsuario,
    empresaId
) {
    const mapa = {};

    const clienteId =
        resolverClienteId(clienteIdOuUsuario);

    if (!clienteId || !empresaId) {
        console.debug(
            "construirMapaServicosPorAssinatura: parâmetros ausentes"
        );

        return mapa;
    }

    try {
        const assinaturasRef = collection(
            db,
            "empresarios",
            empresaId,
            "clientes",
            clienteId,
            "assinaturas"
        );

        const consulta = query(
            assinaturasRef,
            where("status", "==", "ativo")
        );

        const snapshot = await getDocs(consulta);

        if (snapshot.empty) {
            return mapa;
        }

        const agora = new Date();

        snapshot.docs.forEach((docSnap) => {
            const dadosAssinatura = docSnap.data();

            const dataFimRaw =
                dadosAssinatura.dataFim;

            let dataFim = null;

            try {
                if (
                    dataFimRaw &&
                    typeof dataFimRaw.toDate === "function"
                ) {
                    dataFim = dataFimRaw.toDate();
                } else if (dataFimRaw) {
                    const dataConvertida =
                        new Date(dataFimRaw);

                    if (
                        !Number.isNaN(
                            dataConvertida.getTime()
                        )
                    ) {
                        dataFim = dataConvertida;
                    }
                }
            } catch (erroData) {
                console.warn(
                    "Não foi possível interpretar a data final da assinatura:",
                    erroData
                );

                dataFim = null;
            }

            /*
             * Quando existe uma data final válida,
             * a assinatura expirada é ignorada.
             */
            if (dataFim && dataFim <= agora) {
                return;
            }

            const servicosInclusos =
                Array.isArray(
                    dadosAssinatura.servicosInclusos
                )
                    ? dadosAssinatura.servicosInclusos
                    : [];

            servicosInclusos.forEach((item) => {
                const servicoId =
                    String(item.servicoId || "").trim();

                if (!servicoId) {
                    return;
                }

                const quantidadeRaw =
                    item.quantidadeRestante != null
                        ? Number(
                            item.quantidadeRestante
                        )
                        : item.quantidade != null
                            ? Number(item.quantidade)
                            : 0;

                /*
                 * Zero representa ilimitado,
                 * conforme o modelo existente.
                 */
                const quantidadeCalculada =
                    quantidadeRaw === 0
                        ? Infinity
                        : quantidadeRaw;

                if (!mapa[servicoId]) {
                    mapa[servicoId] = {
                        totalDisponivel: 0,
                        assinaturas: []
                    };
                }

                mapa[servicoId].assinaturas.push({
                    assinaturaId: docSnap.id,

                    quantidadeRestante:
                        quantidadeRaw,

                    planoNome:
                        dadosAssinatura.planoNome ||
                        null,

                    dataFim
                });

                const totalAtual =
                    mapa[servicoId]
                        .totalDisponivel;

                mapa[servicoId]
                    .totalDisponivel =
                        totalAtual === Infinity ||
                        quantidadeCalculada === Infinity
                            ? Infinity
                            : totalAtual +
                              quantidadeCalculada;
            });
        });

        console.debug(
            "construirMapaServicosPorAssinatura: mapa construído",
            {
                clienteId,
                mapa
            }
        );

        return mapa;

    } catch (error) {
        console.error(
            "Erro ao construir mapa de serviços por assinatura:",
            error
        );

        return mapa;
    }
}

/**
 * aplicarAssinaturasNaListaServicos(
 *     listaServicos,
 *     mapaServicosInclusos
 * )
 *
 * Marca cada serviço com:
 * - fazParteDaAssinatura;
 * - inclusoAssinatura;
 * - precoOriginal;
 * - precoCobrado;
 * - assinaturasCandidatas.
 */

export function aplicarAssinaturasNaListaServicos(
    listaServicos = [],
    mapaServicosInclusos = {}
) {
    if (!Array.isArray(listaServicos)) {
        return;
    }

    listaServicos.forEach((servico) => {
        const servicoId =
            servico.id ||
            servico.servicoId ||
            servico.dataId;

        if (!servicoId) {
            return;
        }

        const informacaoAssinatura =
            mapaServicosInclusos[
                String(servicoId)
            ];

        const possuiCredito =
            informacaoAssinatura &&
            (
                informacaoAssinatura
                    .totalDisponivel === Infinity ||

                informacaoAssinatura
                    .totalDisponivel > 0
            );

        if (possuiCredito) {
            servico.fazParteDaAssinatura = true;
            servico.inclusoAssinatura = true;

            servico.precoOriginal =
                servico.precoOriginal != null
                    ? Number(
                        servico.precoOriginal
                    )
                    : servico.preco != null
                        ? Number(servico.preco)
                        : null;

            /*
             * A vitrine exibe preço zero.
             * A validação definitiva do consumo
             * deve continuar sendo realizada no servidor.
             */
            servico.precoCobrado = 0;

            servico.assinaturasCandidatas =
                informacaoAssinatura
                    .assinaturas
                    .map((assinatura) => ({
                        assinaturaId:
                            assinatura.assinaturaId,

                        quantidadeRestante:
                            assinatura
                                .quantidadeRestante,

                        planoNome:
                            assinatura.planoNome,

                        dataFim:
                            assinatura.dataFim
                    }));

            return;
        }

        servico.fazParteDaAssinatura = false;
        servico.inclusoAssinatura = false;

        if (servico.precoOriginal != null) {
            servico.precoCobrado =
                Number(servico.precoOriginal);
        } else if (servico.preco != null) {
            servico.precoOriginal =
                Number(servico.preco);

            servico.precoCobrado =
                Number(servico.preco);
        } else if (servico.precoCobrado === 0) {
            delete servico.precoCobrado;
        }

        delete servico.assinaturasCandidatas;
    });
}

/**
 * marcarServicosInclusosParaUsuario(
 *     listaServicos,
 *     empresaId,
 *     clienteIdOuUsuario
 * )
 *
 * O terceiro parâmetro é opcional.
 *
 * Fluxo atual:
 *
 * marcarServicosInclusosParaUsuario(
 *     listaServicos,
 *     empresaId
 * );
 *
 * Novo fluxo:
 *
 * marcarServicosInclusosParaUsuario(
 *     listaServicos,
 *     empresaId,
 *     state.clienteId
 * );
 */

export async function marcarServicosInclusosParaUsuario(
    listaServicos = [],
    empresaId,
    clienteIdOuUsuario = null
) {
    try {
        const usuarioAutenticado =
            auth.currentUser;

        /*
         * Sem login, nenhum serviço pode aparecer
         * como incluso em uma assinatura.
         */
        if (!usuarioAutenticado) {
            console.debug(
                "marcarServicosInclusosParaUsuario: usuário não autenticado"
            );

            limparAssinaturasDaListaServicos(
                listaServicos
            );

            return {};
        }

        const clienteId =
            resolverClienteId(
                clienteIdOuUsuario
            ) || usuarioAutenticado.uid;

        if (!clienteId || !empresaId) {
            console.debug(
                "marcarServicosInclusosParaUsuario: cliente ou empresa não identificado"
            );

            limparAssinaturasDaListaServicos(
                listaServicos
            );

            return {};
        }

        const mapa =
            await construirMapaServicosPorAssinatura(
                clienteId,
                empresaId
            );

        aplicarAssinaturasNaListaServicos(
            listaServicos,
            mapa
        );

        return mapa;

    } catch (error) {
        console.error(
            "Erro ao marcar serviços incluídos para o usuário:",
            error
        );

        /*
         * Em caso de erro, mantém comportamento seguro:
         * nenhum serviço aparece gratuitamente.
         */
        limparAssinaturasDaListaServicos(
            listaServicos
        );

        return {};
    }
}

export default {
    construirMapaServicosPorAssinatura,
    aplicarAssinaturasNaListaServicos,
    marcarServicosInclusosParaUsuario
};
