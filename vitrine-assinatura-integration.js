// vitrine-assinatura-integration.js
// Integração mínima para detectar assinaturas do cliente e marcar serviços na vitrine.
// Coloque este arquivo na mesma pasta do vitrine.html (ou ajuste o import no HTML).

import { db, auth } from './vitrini-firebase.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/**
 * construirMapaServicosPorAssinatura(clienteUid, empresaId)
 *
 * Retorna um mapa no formato:
 * {
 *   [servicoId]: {
 *     totalDisponivel: Number | Infinity,
 *     assinaturas: [
 *       { assinaturaId, quantidadeRestante: Number, planoNome, dataFimTimestamp }
 *     ]
 *   },
 *   ...
 * }
 *
 * Observações:
 * - Considera apenas assinaturas com status === 'ativo' e dataFim > agora (válidas).
 * - Interpreta quantidadeRestante === 0 como ilimitado (Infinity) para cálculo de totalDisponivel,
 *   mas mantém a quantidadeRaw em assinaturas (0 = ilimitado).
 */
export async function construirMapaServicosPorAssinatura(clienteUid, empresaId) {
  const mapa = {};
  if (!clienteUid || !empresaId) {
    console.debug('construirMapa: parâmetros ausentes');
    return mapa;
  }
  try {
    const assinCol = collection(db, `empresarios/${empresaId}/clientes/${clienteUid}/assinaturas`);
    const q = query(assinCol, where('status', '==', 'ativo'));
    const snap = await getDocs(q);
    if (snap.empty) return mapa;

    const agora = new Date();

    snap.docs.forEach(docSnap => {
      const data = docSnap.data();

      // filtra assinaturas expiradas (segurança adicional)
      const dataFimRaw = data.dataFim;
      let dataFim = null;
      try {
        dataFim = dataFimRaw && typeof dataFimRaw.toDate === 'function' ? dataFimRaw.toDate() : new Date(dataFimRaw);
      } catch (err) {
        dataFim = null;
      }
      if (dataFim && !(dataFim > agora)) {
        // assinatura expirada — ignora
        return;
      }

      const itens = Array.isArray(data.servicosInclusos) ? data.servicosInclusos : [];
      itens.forEach(item => {
        const sid = String(item.servicoId);
        const qtdRaw = (item.quantidadeRestante != null) ? Number(item.quantidadeRestante) : (item.quantidade != null ? Number(item.quantidade) : 0);
        const qtd = (qtdRaw === 0) ? Infinity : qtdRaw;

        if (!mapa[sid]) mapa[sid] = { totalDisponivel: 0, assinaturas: [] };

        mapa[sid].assinaturas.push({
          assinaturaId: docSnap.id,
          quantidadeRestante: qtdRaw, // 0 significa ilimitado conforme seu modelo
          planoNome: data.planoNome || null,
          dataFim: dataFim // pode ser null se não houver timestamp legível
        });

        mapa[sid].totalDisponivel = (mapa[sid].totalDisponivel === Infinity || qtd === Infinity)
          ? Infinity
          : (mapa[sid].totalDisponivel + qtd);
      });
    });

    console.debug('construirMapaServicosPorAssinatura: mapa construído', mapa);
    return mapa;
  } catch (err) {
    console.error('Erro construirMapaServicosPorAssinatura:', err);
    return mapa;
  }
}

/**
 * aplicarAssinaturasNaListaServicos(listaServicos, mapaServicosInclusos)
 *
 * Marca cada objeto de serviço com:
 * - fazParteDaAssinatura: boolean (flag principal usada pelo agendamento)
 * - inclusoAssinatura: boolean (compatibilidade visual)
 * - precoOriginal: preserva preço original se não existir
 * - precoCobrado: 0 quando incluso (para UI); atenção: servidor deve validar também
 * - assinaturasCandidatas: lista de assinaturas candidatas para consumo (opcional)
 */
export function aplicarAssinaturasNaListaServicos(listaServicos = [], mapaServicosInclusos = {}) {
  if (!Array.isArray(listaServicos)) return;
  listaServicos.forEach(servico => {
    const sid = servico.id || servico.servicoId || servico.dataId;
    if (!sid) return;

    const info = mapaServicosInclusos[String(sid)];
    const temCredito = info && (info.totalDisponivel === Infinity || info.totalDisponivel > 0);

    if (temCredito) {
      // marca explicitamente que o serviço faz parte do plano para este usuário
      servico.fazParteDaAssinatura = true;
      servico.inclusoAssinatura = true;

      // preserva precoOriginal se não estiver preenchido
      servico.precoOriginal = (servico.precoOriginal != null)
        ? servico.precoOriginal
        : (servico.preco != null ? Number(servico.preco) : null);

      // marca preço exibido como 0 (UI). A decisão definitiva deve ser validada no servidor.
      servico.precoCobrado = 0;

      // informação útil para escolher qual assinatura consumir (no servidor a escolha deve ser confirmada)
      servico.assinaturasCandidatas = info.assinaturas.map(a => ({
        assinaturaId: a.assinaturaId,
        quantidadeRestante: a.quantidadeRestante,
        planoNome: a.planoNome,
        dataFim: a.dataFim
      }));
    } else {
      // garante flags claras quando NÃO incluso
      servico.fazParteDaAssinatura = false;
      servico.inclusoAssinatura = false;

      // não sobrescreve precoOriginal; remove precoCobrado 0 caso exista para evitar UI enganosa
      if (servico.precoOriginal != null) {
        // restaurar precoCobrado ao preço normal se disponível
        servico.precoCobrado = servico.precoOriginal;
      } else if (servico.preco != null) {
        servico.precoOriginal = Number(servico.preco);
        servico.precoCobrado = Number(servico.preco);
      } else {
        // não há preço conhecido; remove precoCobrado se for 0
        if (servico.precoCobrado === 0) delete servico.precoCobrado;
      }

      // limpa candidatas caso existam
      delete servico.assinaturasCandidatas;
    }
  });
}

/**
 * marcarServicosInclusosParaUsuario(listaServicos, empresaId)
 *
 * - Se usuário não autenticado: garante que todos os serviços sejam marcados como não inclusos.
 * - Se autenticado: constrói mapa de assinaturas válidas e aplica nas listas.
 *
 * Retorna o mapa construído (ou objeto vazio).
 */
export async function marcarServicosInclusosParaUsuario(listaServicos = [], empresaId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.debug('marcarServicosInclusosParaUsuario: usuário não autenticado - ajustando flags para false');
      // assegura que os serviços não apareçam como inclusos para visitantes
      if (Array.isArray(listaServicos)) {
        listaServicos.forEach(servico => {
          servico.fazParteDaAssinatura = false;
          servico.inclusoAssinatura = false;
          // restaura precoCobrado para precoOriginal se houver
          if (servico.precoOriginal != null) {
            servico.precoCobrado = servico.precoOriginal;
          } else if (servico.preco != null) {
            servico.precoOriginal = Number(servico.preco);
            servico.precoCobrado = Number(servico.preco);
          } else {
            if (servico.precoCobrado === 0) delete servico.precoCobrado;
          }
          delete servico.assinaturasCandidatas;
        });
      }
      return {};
    }

    const mapa = await construirMapaServicosPorAssinatura(user.uid, empresaId);
    aplicarAssinaturasNaListaServicos(listaServicos, mapa);
    return mapa;
  } catch (err) {
    console.error('Erro marcarServicosInclusosParaUsuario:', err);
    // em caso de erro, tenta garantir flags seguras (não inclusos)
    if (Array.isArray(listaServicos)) {
      listaServicos.forEach(servico => {
        servico.fazParteDaAssinatura = false;
        servico.inclusoAssinatura = false;
        if (servico.precoOriginal != null) {
          servico.precoCobrado = servico.precoOriginal;
        } else if (servico.preco != null) {
          servico.precoOriginal = Number(servico.preco);
          servico.precoCobrado = Number(servico.preco);
        } else {
          if (servico.precoCobrado === 0) delete servico.precoCobrado;
        }
        delete servico.assinaturasCandidatas;
      });
    }
    return {};
  }
}

export default {
  construirMapaServicosPorAssinatura,
  aplicarAssinaturasNaListaServicos,
  marcarServicosInclusosParaUsuario
};
