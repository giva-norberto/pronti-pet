'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

const REGION = 'southamerica-east1';
const ADMIN_UID = 'HNIJxFjPvSO1oO9X1Gjq7negfR12';
const COL = 'prospeccaoLeads';

function cors(req, res) {
  const origins = ['https://pronti-pet.web.app','https://pronti-pet.firebaseapp.com','http://localhost:5000'];
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
async function isAdmin(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const d = await admin.auth().verifyIdToken(m[1]);
  return d.uid === ADMIN_UID;
}
function slug(s) {
  return String(s || 'pet-shop').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
}
async function googleToken() {
  const c = admin.app().options.credential;
  const t = await c.getAccessToken();
  if (!t || !t.access_token) throw new Error('OAuth Google indisponível');
  return t.access_token;
}
async function places(query) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method:'POST',
    headers:{
      Authorization:'Bearer ' + await googleToken(),
      'X-Goog-User-Project':'pronti-pet',
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({ textQuery:query, languageCode:'pt-BR', regionCode:'BR', maxResultCount:20 })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ('Google Places HTTP ' + r.status));
  return j.places || [];
}

function createProspeccaoFunctions(db) {
  const buscarLeadsProspeccao = onRequest({region:REGION, timeoutSeconds:60}, async (req,res) => {
    cors(req,res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({error:'Método não permitido'});
    try {
      if (!(await isAdmin(req))) return res.status(403).json({error:'Acesso restrito'});
      const all = [];
      for (const q of ['pet shop banho e tosa em Contagem MG','pet shop banho e tosa em Belo Horizonte MG']) {
        all.push(...await places(q));
      }
      const map = new Map();
      all.forEach(p => { if (p.id) map.set(p.id,p); });
      const leads = [...map.values()].filter(p =>
        Number(p.rating || 0) >= 4.2 &&
        Number(p.userRatingCount || 0) >= 30 &&
        Boolean(p.nationalPhoneNumber)
      ).sort((a,b) => (a.websiteUri?1:0)-(b.websiteUri?1:0) || Number(b.userRatingCount||0)-Number(a.userRatingCount||0)).slice(0,30);

      const now = Date.now();
      let novos = 0;
      for (const p of leads) {
        const ref = db.collection(COL).doc(p.id);
        const oldSnap = await ref.get();
        const old = oldSnap.exists ? oldSnap.data() : {};
        const nome = (p.displayName && p.displayName.text) || 'Pet Shop';
        await ref.set({
          placeId:p.id,
          status:old.status || 'demo_pronta',
          demoToken:old.demoToken || crypto.randomBytes(18).toString('hex'),
          demoSlug:old.demoSlug || (slug(nome) + '-' + p.id.slice(-6).toLowerCase()),
          demoExpiraEm:admin.firestore.Timestamp.fromDate(new Date(now + 14*86400000)),
          googleSnapshot:{
            nome,
            endereco:p.formattedAddress || '',
            nota:Number(p.rating || 0),
            quantidadeAvaliacoes:Number(p.userRatingCount || 0),
            telefone:p.nationalPhoneNumber || '',
            website:p.websiteUri || '',
            semSite:!p.websiteUri
          },
          googleSnapshotExpiraEm:admin.firestore.Timestamp.fromDate(new Date(now + 28*86400000)),
          atualizadoEm:admin.firestore.FieldValue.serverTimestamp(),
          criadoEm:old.criadoEm || admin.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        if (!oldSnap.exists) novos++;
      }
      return res.json({encontrados:leads.length, novos});
    } catch (e) {
      logger.error('prospeccao buscar', e);
      const msg = String(e.message || e);
      const setup = /PERMISSION_DENIED|SERVICE_DISABLED|billing|API/i.test(msg);
      return res.status(setup?503:500).json({error:setup?'Ative a Places API (New) e o faturamento no projeto pronti-pet.':'Falha ao buscar leads', detalhes:msg});
    }
  });

  const listarLeadsProspeccao = onRequest({region:REGION}, async (req,res) => {
    cors(req,res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!(await isAdmin(req))) return res.status(403).json({error:'Acesso restrito'});
    const s = await db.collection(COL).orderBy('atualizadoEm','desc').limit(200).get();
    const now = Date.now();
    const leads = s.docs.map(d => {
      const x=d.data(), valid=x.googleSnapshotExpiraEm && x.googleSnapshotExpiraEm.toMillis()>now;
      const g=valid?(x.googleSnapshot||{}):{};
      return {id:d.id,nome:g.nome||'Dados expirados',nota:g.nota??null,quantidadeAvaliacoes:g.quantidadeAvaliacoes??null,
        telefone:g.telefone||'',website:g.website||'',semSite:g.semSite===true,status:x.status||'novo',
        demoToken:x.demoToken||'',demoSlug:x.demoSlug||'',quantidadeAberturas:Number(x.quantidadeAberturas||0)};
    });
    res.set('Cache-Control','no-store');
    return res.json({leads});
  });

  const atualizarLeadProspeccao = onRequest({region:REGION}, async (req,res) => {
    cors(req,res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!(await isAdmin(req))) return res.status(403).json({error:'Acesso restrito'});
    const id=String(req.body?.id||''), status=String(req.body?.status||'');
    if (!id || !['novo','demo_pronta','enviado','abriu','interessado','cliente','descartado'].includes(status))
      return res.status(400).json({error:'Dados inválidos'});
    const u={status,atualizadoEm:admin.firestore.FieldValue.serverTimestamp()};
    if(status==='enviado') u.enviadoEm=admin.firestore.FieldValue.serverTimestamp();
    await db.collection(COL).doc(id).set(u,{merge:true});
    return res.json({ok:true});
  });

  const obterDemoProspeccao = onRequest({region:REGION}, async (req,res) => {
    cors(req,res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    const token=String(req.query?.token||'');
    if(!/^[a-f0-9]{36}$/.test(token)) return res.status(400).json({error:'Demo inválida'});
    const s=await db.collection(COL).where('demoToken','==',token).limit(1).get();
    if(s.empty) return res.status(404).json({error:'Demo não encontrada'});
    const d=s.docs[0], x=d.data(), now=Date.now();
    if(!x.demoExpiraEm || x.demoExpiraEm.toMillis()<now) return res.status(410).json({error:'Demo expirada'});
    if(!x.googleSnapshotExpiraEm || x.googleSnapshotExpiraEm.toMillis()<now) return res.status(410).json({error:'Dados expirados'});
    if(String(req.query?.preview||'')!=='1') {
      const u={ultimaAbertura:admin.firestore.FieldValue.serverTimestamp(),quantidadeAberturas:admin.firestore.FieldValue.increment(1),atualizadoEm:admin.firestore.FieldValue.serverTimestamp()};
      if(!x.primeiraAbertura) u.primeiraAbertura=admin.firestore.FieldValue.serverTimestamp();
      if(['novo','demo_pronta','enviado'].includes(x.status)) u.status='abriu';
      await d.ref.set(u,{merge:true});
    }
    const g=x.googleSnapshot||{};
    res.set('Cache-Control','no-store');
    return res.json({nome:g.nome||'Pet Shop',endereco:g.endereco||'',telefone:g.telefone||''});
  });

  const registrarEventoDemoProspeccao = onRequest({region:REGION}, async (req,res) => {
    cors(req,res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    const token=String(req.body?.token||'');
    if(!/^[a-f0-9]{36}$/.test(token) || req.body?.evento!=='interessado') return res.status(400).json({error:'Evento inválido'});
    const s=await db.collection(COL).where('demoToken','==',token).limit(1).get();
    if(s.empty) return res.status(404).json({error:'Demo não encontrada'});
    await s.docs[0].ref.set({status:'interessado',interessadoEm:admin.firestore.FieldValue.serverTimestamp(),atualizadoEm:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return res.status(204).send('');
  });

  return {buscarLeadsProspeccao,listarLeadsProspeccao,atualizarLeadProspeccao,obterDemoProspeccao,registrarEventoDemoProspeccao};
}
module.exports={createProspeccaoFunctions};
