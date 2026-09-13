'use strict';

const existingFunctions = require('./index');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const cors = require('cors');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const REGION = 'southamerica-east1';

const whitelist = [
  'https://pronti-pet.web.app',
  'https://pronti-pet.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
];

const corsHandler = cors({
  origin(origin, callback) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origem não permitida por CORS'));
  },
  credentials: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const buscarDisponibilidadePublica = onRequest(
  { region: REGION },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') {
        return res.status(204).send('');
      }

      if (req.method !== 'POST') {
        return res.status(405).json({
          error: 'Método não permitido. Use POST.',
        });
      }

      try {
        const empresaId = String(req.body?.empresaId || '').trim();
        const data = String(req.body?.data || '').trim();

        if (!empresaId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
          return res.status(400).json({
            error: 'Empresa ou data inválida.',
          });
        }

        const snapshot = await db
          .collection('empresarios')
          .doc(empresaId)
          .collection('agendamentos')
          .where('data', '==', data)
          .where('status', '==', 'ativo')
          .get();

        const agendamentos = snapshot.docs
          .map((docSnap) => {
            const dados = docSnap.data() || {};

            const profissionalId = String(
              dados.profissionalId || dados.profissional?.id || ''
            ).trim();

            const horario = String(
              dados.horario || dados.horarioTexto || ''
            ).trim();

            const servicoDuracao = Number(
              dados.servicoDuracao || dados.servico?.duracao || 0
            );

            return {
              profissionalId,
              horario,
              servicoDuracao,
            };
          })
          .filter(
            (item) =>
              item.profissionalId &&
              /^\d{2}:\d{2}$/.test(item.horario) &&
              Number.isFinite(item.servicoDuracao) &&
              item.servicoDuracao > 0
          );

        res.set('Cache-Control', 'no-store');
        return res.status(200).json({ agendamentos });
      } catch (error) {
        logger.error('Erro ao consultar disponibilidade pública:', error);

        return res.status(500).json({
          error: 'Não foi possível consultar a disponibilidade.',
        });
      }
    });
  }
);

const EVENTOS_MARKETING_PERMITIDOS = new Set([
  'page_view',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_100',
  'cta_click',
  'faq_aberta',
  'share_open',
  'share_whatsapp',
  'share_copy',
]);

function textoSeguro(valor, limite = 120) {
  return String(valor || '').trim().slice(0, limite);
}

const registrarEventoMarketing = onRequest(
  { region: REGION },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') {
        return res.status(204).send('');
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
      }

      try {
        const evento = textoSeguro(req.body?.evento, 40);
        const sessionId = textoSeguro(req.body?.sessionId, 64);

        if (
          !EVENTOS_MARKETING_PERMITIDOS.has(evento) ||
          !/^[a-zA-Z0-9-]{8,64}$/.test(sessionId)
        ) {
          return res.status(400).json({ error: 'Evento inválido.' });
        }

        await db.collection('marketingEventos').add({
          evento,
          sessionId,
          detalhe: textoSeguro(req.body?.detalhe, 80),
          source: textoSeguro(req.body?.source, 80),
          medium: textoSeguro(req.body?.medium, 80),
          campaign: textoSeguro(req.body?.campaign, 100),
          path: textoSeguro(req.body?.path, 120),
          referrer: textoSeguro(req.body?.referrer, 300),
          pagina: 'apresentacao',
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.set('Cache-Control', 'no-store');
        return res.status(204).send('');
      } catch (error) {
        logger.error('Erro ao registrar evento de marketing:', error);
        return res.status(500).json({ error: 'Não foi possível registrar o evento.' });
      }
    });
  }
);

module.exports = Object.assign({}, existingFunctions, {
  buscarDisponibilidadePublica,
  registrarEventoMarketing,
});
