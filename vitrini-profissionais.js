// vitrini-profissionais.js (versão 100% correta)

import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const PRONTI_PET_LOGO_FALLBACK =
    "https://firebasestorage.googleapis.com/v0/b/pronti-pet.firebasestorage.app/o/logos%2Fpronti-pet%2Flogo-pronti-pet.png?alt=media&token=9e81c0bf-fe3e-4814-a8f5-a484312ff55b";

const CHAVE_EMPRESA_VITRINE = 'pronti_pet_vitrine_empresa';

let manifestBlobUrl = null;

function registrarServiceWorkerVitrine() {
    if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator)
    ) {
        return;
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw-vitrine.js')
            .catch((error) => {
                console.info(
                    '[Pronti Pet] Cache offline da vitrine não pôde ser ativado:',
                    error?.message || error
                );
            });
    }, { once: true });
}

registrarServiceWorkerVitrine();

function garantirMeta(name, content) {
    let meta = document.head.querySelector(`meta[name="${name}"]`);

    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
    }

    meta.setAttribute('content', content);
}

function garantirLink(rel, href, marcador) {
    const seletor = marcador
        ? `link[rel="${rel}"][data-pronti="${marcador}"]`
        : `link[rel="${rel}"]`;

    let link = document.head.querySelector(seletor);

    if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);

        if (marcador) {
            link.dataset.pronti = marcador;
        }

        document.head.appendChild(link);
    }

    link.setAttribute('href', href);
    return link;
}

function obterNomeCurto(nome) {
    const texto = String(nome || 'Pet Shop').trim();

    if (texto.length <= 24) {
        return texto;
    }

    return texto.slice(0, 24).trim();
}

function estaNaVitrine() {
    const caminho = String(window.location.pathname || '').toLowerCase();
    return caminho === '/' || caminho.endsWith('/vitrine.html');
}

function persistirEmpresaDaVitrine(empresaId) {
    const id = String(empresaId || '').trim();
    if (!id || typeof window === 'undefined' || !estaNaVitrine()) return;

    try {
        localStorage.setItem(CHAVE_EMPRESA_VITRINE, id);
    } catch (error) {
        console.info('[Pronti Pet] Não foi possível persistir a empresa da vitrine:', error?.message || error);
    }

    try {
        const urlAtual = new URL(window.location.href);
        if (urlAtual.searchParams.get('empresa') !== id) {
            urlAtual.searchParams.set('empresa', id);
            window.history.replaceState(window.history.state, '', urlAtual.href);
        }
    } catch (error) {
        console.info('[Pronti Pet] Não foi possível fixar a empresa na URL da vitrine:', error?.message || error);
    }
}

function aplicarIdentidadePwaEmpresa(dadosEmpresa, empresaId) {
    if (
        typeof window === 'undefined' ||
        typeof document === 'undefined' ||
        !dadosEmpresa ||
        !empresaId
    ) {
        return;
    }

    persistirEmpresaDaVitrine(empresaId);

    const nomeEmpresa =
        String(dadosEmpresa.nomeFantasia || 'Pet Shop').trim() || 'Pet Shop';

    const logoEmpresa =
        String(dadosEmpresa.logoUrl || '').trim() || PRONTI_PET_LOGO_FALLBACK;

    const tema =
        String(dadosEmpresa.corPrimaria || '#5522b6').trim() || '#5522b6';

    const startUrl =
        `/vitrine.html?empresa=${encodeURIComponent(empresaId)}`;

    const manifest = {
        id: startUrl,
        name: nomeEmpresa,
        short_name: obterNomeCurto(nomeEmpresa),
        description: `Agendamentos e acompanhamento de serviços - ${nomeEmpresa}`,
        start_url: startUrl,
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: tema,
        orientation: 'portrait-primary',
        icons: [
            {
                src: logoEmpresa,
                sizes: 'any',
                purpose: 'any'
            }
        ]
    };

    if (manifestBlobUrl) {
        URL.revokeObjectURL(manifestBlobUrl);
    }

    manifestBlobUrl = URL.createObjectURL(
        new Blob(
            [JSON.stringify(manifest)],
            { type: 'application/manifest+json' }
        )
    );

    garantirLink('manifest', manifestBlobUrl, 'manifest-vitrine');
    garantirLink('apple-touch-icon', logoEmpresa, 'icone-vitrine-ios');
    garantirLink('icon', logoEmpresa, 'icone-vitrine');

    garantirMeta('theme-color', tema);
    garantirMeta('mobile-web-app-capable', 'yes');
    garantirMeta('apple-mobile-web-app-capable', 'yes');
    garantirMeta('apple-mobile-web-app-status-bar-style', 'default');
    garantirMeta('apple-mobile-web-app-title', obterNomeCurto(nomeEmpresa));

    document.title = nomeEmpresa;
}

/**
 * Pega o ID da empresa a partir da URL ou do localStorage.
 * @returns {string|null} O ID da empresa ou nulo.
 */
export function getEmpresaIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const empresaDaUrl = String(params.get('empresa') || '').trim();

    if (empresaDaUrl) {
        if (estaNaVitrine()) {
            try {
                localStorage.setItem(CHAVE_EMPRESA_VITRINE, empresaDaUrl);
            } catch (error) {
                console.info('[Pronti Pet] Não foi possível memorizar a empresa da URL:', error?.message || error);
            }
        }
        return empresaDaUrl;
    }

    const empresaDaVitrine = String(
        localStorage.getItem(CHAVE_EMPRESA_VITRINE) || ''
    ).trim();

    if (empresaDaVitrine) {
        persistirEmpresaDaVitrine(empresaDaVitrine);
        return empresaDaVitrine;
    }

    const empresaAtiva = String(
        localStorage.getItem('empresaAtivaId') || ''
    ).trim();

    if (empresaAtiva) {
        persistirEmpresaDaVitrine(empresaAtiva);
        return empresaAtiva;
    }

    return null;
}

/**
 * Busca os dados principais de uma empresa no Firestore.
 * @param {string} empresaId - O ID da empresa.
 * @returns {Promise<Object|null>} Os dados da empresa ou nulo.
 */
export async function getDadosEmpresa(empresaId) {
    try {
        // CORRIGIDO: Usando 'empresarios' para corresponder às suas regras de segurança.
        const empresaRef = doc(db, 'empresarios', empresaId);
        const empresaSnap = await getDoc(empresaRef);
        const dadosEmpresa = empresaSnap.exists() ? empresaSnap.data() : null;

        if (dadosEmpresa) {
            aplicarIdentidadePwaEmpresa(dadosEmpresa, empresaId);
        }

        return dadosEmpresa;
    } catch (error) {
        console.error("Erro ao buscar dados da empresa:", error);
        return null;
    }
}

/**
 * Busca a lista de todos os profissionais de uma empresa.
 * @param {string} empresaId - O ID da empresa.
 * @returns {Promise<Array>} Uma lista com os profissionais.
 */
export async function getProfissionaisDaEmpresa(empresaId) {
    try {
        // CORRIGIDO: Usando 'empresarios'.
        const profissionaisRef = collection(db, 'empresarios', empresaId, 'profissionais');
        const snapshot = await getDocs(profissionaisRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar profissionais:", error);
        return [];
    }
}

/**
 * Busca a lista de todos os serviços que uma empresa oferece.
 * @param {string} empresaId - O ID da empresa.
 * @returns {Promise<Array>} Uma lista com todos os serviços.
 */
export async function getTodosServicosDaEmpresa(empresaId) {
    try {
        // CORRIGIDO: Usando 'empresarios'.
        const servicosRef = collection(db, 'empresarios', empresaId, 'servicos');
        const snapshot = await getDocs(servicosRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar todos os serviços:", error);
        return [];
    }
}

/**
 * Busca a configuração de horários de um profissional específico.
 * @param {string} empresaId - O ID do profissional.
 * @param {string} profissionalId - O ID do profissional.
 * @returns {Promise<Object|null>} O objeto de horários ou nulo.
 */
export async function getHorariosDoProfissional(empresaId, profissionalId) {
    try {
        // CORRIGIDO: Usando 'empresarios'.
        const horariosRef = doc(db, 'empresarios', empresaId, 'profissionais', profissionalId, 'configuracoes', 'horarios');
        const horariosSnap = await getDoc(horariosRef);
        return horariosSnap.exists() ? horariosSnap.data() : null;
    } catch (error) {
        console.error("Erro ao buscar horários do profissional:", error);
        return null;
    }
}
