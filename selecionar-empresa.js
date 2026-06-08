/**
 * selecionar-empresa.js
 * Script para a página de seleção de empresa.
 * Mantive toda a lógica existente e adicionei apenas garantia extra para
 * abrir perfil em modo "criar" sem levar empresa ativa.
 */

// Importações diretas
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where, documentId } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- Elementos do DOM ---
const grid = document.getElementById('empresas-grid' );
const loader = document.getElementById('loader');
const tituloBoasVindas = document.getElementById('titulo-boas-vindas');
const btnLogout = document.getElementById('btn-logout');

// --- Eventos ---
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        // remove empresa ativa e sai
        try { localStorage.removeItem('empresaAtivaId'); } catch (e) { /* ignore */ }
        try { localStorage.removeItem('empresaModo'); } catch (e) { /* ignore */ }
        try { sessionStorage.clear(); } catch (e) { /* ignore */ }
        await signOut(auth).catch(error => console.error("Erro ao sair:", error));
        window.location.href = 'login.html';
    });
}

// Ponto de entrada principal do script
onAuthStateChanged(auth, (user) => {
    if (user) {
        // garantir que não exista empresa ativa pré-selecionada ao entrar na seleção
        try { localStorage.removeItem('empresaAtivaId'); } catch (e) { /* ignore */ }
        const primeiroNome = user.displayName ? user.displayName.split(' ')[0] : 'Empreendedor(a)';
        try { localStorage.setItem('usuarioNome', primeiroNome); } catch (e) { /* ignore */ }

        if (tituloBoasVindas) {
            tituloBoasVindas.textContent = `Bem-vindo(a), ${primeiroNome}!`;
        }
        carregarEmpresas(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// --- Utilitários de Data ---
/**
 * Converte vários formatos possíveis em Date ou retorna null:
 * - Firestore Timestamp (objeto com toDate())
 * - Objeto plain { seconds: number }
 * - Date
 * - ISO string / timestamp string
 */
function tsToDate(value) {
    if (!value && value !== 0) return null;
    try {
        if (typeof value.toDate === 'function') {
            return value.toDate();
        }
        if (value && typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000);
        }
        if (value instanceof Date) return value;
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
    } catch (err) {
        // fallback null
    }
    return null;
}

function hojeSemHoras() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function dateOnlyUTCmsFromDate(d) {
    if (!d) return null;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function dateOnlyUTCmsFromValue(v) {
    const d = tsToDate(v);
    return d ? dateOnlyUTCmsFromDate(d) : null;
}

// ==========================================================
// ✅ FUNÇÃO DE VALIDAÇÃO (mantendo prioridade existente)
// ==========================================================
function checkEmpresaStatus(empresaData) {
    try {
        if (!empresaData) return { isPaid: false, isTrialActive: false };

        if (empresaData.status && String(empresaData.status).toLowerCase() !== 'ativo') {
            return { isPaid: false, isTrialActive: false };
        }

        const now = new Date();
        const hojeUTCms = dateOnlyUTCmsFromDate(hojeSemHoras());

        // 1) assinatura / pagamento (prioridade)
        const assinaturaValidaAte = tsToDate(empresaData.assinaturaValidaAte || empresaData.assinatura_valida_ate || empresaData.paidUntil || empresaData.paid_until);
        const proximoPagamento = tsToDate(empresaData.proximoPagamento || empresaData.proximo_pagamento || empresaData.nextPayment);
        const planoPago = (String(empresaData.plano || '').toLowerCase() === 'pago' ||
                           String(empresaData.plano || '').toLowerCase() === 'premium' ||
                           String(empresaData.planStatus || '').toLowerCase() === 'active' ||
                           String(empresaData.plan_status || '').toLowerCase() === 'active');
        const assinaturaAtivaFlag = empresaData.assinaturaAtiva === true || empresaData.assinatura_ativa === true;
        const isApprovedManual = empresaData.aprovado === true || empresaData.approved === true;

        if (planoPago || assinaturaAtivaFlag || isApprovedManual) {
            if (assinaturaValidaAte) {
                if (assinaturaValidaAte.getTime() > now.getTime()) return { isPaid: true, isTrialActive: false };
                return { isPaid: false, isTrialActive: false }; // pago mas expirou
            }
            return { isPaid: true, isTrialActive: false }; // pago sem data
        }

        // 2) próximo pagamento futuro
        if (proximoPagamento && proximoPagamento.getTime() > now.getTime()) {
            return { isPaid: true, isTrialActive: false };
        }

        // 3) TRIAL via trialEndDate (date-only)
        const trialRaw = empresaData.trialEndDate || empresaData.trial_end || empresaData.trialEnds || empresaData.trial_ends;
        const trialEndMs = dateOnlyUTCmsFromValue(trialRaw);
        if (trialEndMs !== null) {
            if (trialEndMs >= hojeUTCms) return { isPaid: false, isTrialActive: true };
            return { isPaid: false, isTrialActive: false };
        }

        // 4) fallback freeEmDias + createdAt
        const freeEmDias = Number(empresaData.freeEmDias ?? empresaData.free_em_dias ?? 0);
        if (freeEmDias > 0) {
            const createdAt = tsToDate(empresaData.createdAt || empresaData.created_at || empresaData.created);
            if (createdAt) {
                const end = new Date(createdAt);
                end.setDate(end.getDate() + (freeEmDias - 1));
                end.setHours(23,59,59,999);
                const endUTC = dateOnlyUTCmsFromDate(end);
                if (endUTC !== null && endUTC >= hojeUTCms) return { isPaid: false, isTrialActive: true };
                return { isPaid: false, isTrialActive: false };
            }
        }

        // 5) default expirado
        return { isPaid: false, isTrialActive: false };
    } catch (err) {
        console.error("Erro em checkEmpresaStatus:", err, "empresaData:", empresaData);
        return { isPaid: false, isTrialActive: false };
    }
}

// --- Funções Principais (com a lógica de redirecionamento) ---
async function carregarEmpresas(userId) {
    try {
        const mapaUsuarioRef = doc(db, "mapaUsuarios", userId);
        const mapaUsuarioSnap = await getDoc(mapaUsuarioRef);

        if (!mapaUsuarioSnap.exists() || !Array.isArray(mapaUsuarioSnap.data().empresas) || mapaUsuarioSnap.data().empresas.length === 0) {
            renderizarOpcoes([]); 
            return;
        }

        const idsDasEmpresas = mapaUsuarioSnap.data().empresas;

        // --- Validação para 1 Empresa ---
        if (idsDasEmpresas.length === 1) {
            const empresaId = idsDasEmpresas[0];
            try { localStorage.setItem('empresaAtivaId', empresaId); } catch (e) { /* ignore */ }

            const empresaRef = doc(db, "empresarios", empresaId);
            const empresaSnap = await getDoc(empresaRef);
            const empresaData = empresaSnap.exists() ? empresaSnap.data() : null;

            const status = checkEmpresaStatus(empresaData);

            if (status.isPaid || status.isTrialActive) {
                window.location.href = 'index.html'; // OK
            } else {
                window.location.href = 'assinatura.html'; // Expirado
            }
            return;
        }

        // --- Validação para Múltiplas Empresas ---
        const empresas = [];
        const CHUNK_SIZE = 10; 
        for (let i = 0; i < idsDasEmpresas.length; i += CHUNK_SIZE) {
            const chunk = idsDasEmpresas.slice(i, i + CHUNK_SIZE);
            const empresasRef = collection(db, "empresarios");
            const q = query(empresasRef, where(documentId(), "in", chunk));
            const snapshots = await getDocs(q);
            snapshots.forEach(snap => {
                if (snap.exists()) empresas.push({ id: snap.id, ...snap.data() });
            });
        }
        
        const empresasComStatus = empresas.map(empresa => {
            const status = checkEmpresaStatus(empresa);
            return { ...empresa, statusAssinatura: status };
        });

        renderizarOpcoes(empresasComStatus); 

    } catch (error) {
        console.error("Erro ao carregar empresas: ", error);
        if (grid) {
            grid.innerHTML = `<p style="color: red;">Erro ao carregar empresas. Detalhes: ${error.message}</p>`;
        }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderizarOpcoes(empresas) {
    if (!grid) return;
    grid.innerHTML = '';
    if (empresas.length > 0) {
        empresas.forEach(empresa => {
            grid.appendChild(criarEmpresaCard(empresa));
        });
    } else {
        grid.innerHTML = '<p>Você ainda não possui empresas cadastradas.</p>';
    }
    grid.appendChild(criarNovoCard());
}

// --- Card com lógica de clique ---
function criarEmpresaCard(empresa) {
    const card = document.createElement('a');
    card.className = 'empresa-card';
    card.href = '#';

    const status = empresa.statusAssinatura || { isPaid: false, isTrialActive: false };
    const isPaid = status.isPaid;
    const isTrialActive = status.isTrialActive;

    card.addEventListener('click', (e) => {
        e.preventDefault();
        try { localStorage.setItem('empresaAtivaId', empresa.id); } catch (err) { /* ignore */ }
        
        if (isPaid || isTrialActive) {
            window.location.href = 'index.html'; // OK
        } else {
            window.location.href = 'assinatura.html'; // Expirado
        }
    });

    const nomeFantasia = empresa.nomeFantasia || "Empresa Sem Nome";
    const inicial = nomeFantasia.charAt(0).toUpperCase();
    const logoSrc = empresa.logoUrl || `https://placehold.co/100x100/eef2ff/4f46e5?text=${encodeURIComponent(inicial )}`;

    let infoHtml = '';
    if (isPaid) {
        infoHtml = `<span class="status-ativo">Assinatura Ativa</span>`;
    } else if (isTrialActive) {
        infoHtml = `<span class="status-trial">Em Teste</span>`;
    } else {
        infoHtml = `<span class="status-expirado">Expirado</span>`;
    }

    card.innerHTML = `
        <img src="${logoSrc}" alt="Logo de ${nomeFantasia}" class="empresa-logo">
        <span class="empresa-nome">${nomeFantasia}</span>
        ${infoHtml} 
    `;
    return card;
}

function criarNovoCard() {
    const card = document.createElement('a');
    card.className = 'criar-empresa-card';
    card.href = '#';

    card.innerHTML = `
        <div class="plus-icon"><i class="fas fa-plus"></i></div>
        <span class="empresa-nome">Criar Nova Empresa</span>
    `;

    // Ao clicar: limpar dados locais e abrir perfil em modo "criar" (sem empresa ativa)
    card.addEventListener('click', (e) => {
        e.preventDefault();
        try {
            // remover referências que podem deixar o perfil em modo edição
            localStorage.removeItem('empresaAtivaId');
            localStorage.removeItem('empresaAtivaNome');
            localStorage.removeItem('empresaFormDraft');
            localStorage.removeItem('empresaModo');
            sessionStorage.removeItem('empresaEdicao');
            sessionStorage.removeItem('empresaFormData');
            // redundância: set flag de criação (será limpa pelo perfil se ele respeitar)
            localStorage.setItem('empresaModo', 'criar');
            localStorage.setItem('empresaCreateTimestamp', String(Date.now()));
        } catch (err) {
            console.warn('Não foi possível limpar dados locais antes de criar nova empresa:', err);
        }
        // navegar com query param para forçar modo criação
        window.location.href = 'perfil.html?new=1';
    });

    return card;
}

export { checkEmpresaStatus, carregarEmpresas };
