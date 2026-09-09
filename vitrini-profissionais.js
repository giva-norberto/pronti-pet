// vitrini-profissionais.js

import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const PRONTI_PET_LOGO_FALLBACK =
    "https://firebasestorage.googleapis.com/v0/b/pronti-pet.firebasestorage.app/o/logos%2Fpronti-pet%2Flogo-pronti-pet.png?alt=media&token=9e81c0bf-fe3e-4814-a8f5-a484312ff55b";

const CHAVE_EMPRESA_VITRINE = 'pronti_pet_vitrine_empresa';
const COOKIE_EMPRESA_VITRINE = 'pronti_pet_vitrine_empresa';

let manifestBlobUrl = null;

function garantirManifestBase() {
    if (typeof document === 'undefined') return;

    let link = document.head.querySelector('link[rel="manifest"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest-vitrine.json';
        link.dataset.pronti = 'manifest-vitrine-base';
        document.head.appendChild(link);
    }
}

garantirManifestBase();

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

function gravarCookieEmpresa(id) {
    if (!id || typeof document === 'undefined') return;
    try {
        document.cookie = `${COOKIE_EMPRESA_VITRINE}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    } catch (_) {}
}

function lerCookieEmpresa() {
    if (typeof document === 'undefined') return '';
    const prefixo = `${COOKIE_EMPRESA_VITRINE}=`;
    const item = String(document.cookie || '')
        .split(';')
        .map((parte) => parte.trim())
        .find((parte) => parte.startsWith(prefixo));

    if (!item) return '';
    try {
        return decodeURIComponent(item.slice(prefixo.length)).trim();
    } catch (_) {
        return item.slice(prefixo.length).trim();
    }
}

function persistirEmpresaDaVitrine(empresaId) {
    const id = String(empresaId || '').trim();
    if (!id || typeof window === 'undefined' || !estaNaVitrine()) return;

    try {
        localStorage.setItem(CHAVE_EMPRESA_VITRINE, id);
    } catch (error) {
        console.info('[Pronti Pet] Não foi possível persistir a empresa da vitrine:', error?.message || error);
    }

    gravarCookieEmpresa(id);

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

    const manifestBase = document.head.querySelector('link[rel="manifest"]');
    if (manifestBase) {
        manifestBase.href = manifestBlobUrl;
        manifestBase.dataset.pronti = 'manifest-vitrine';
    } else {
        garantirLink('manifest', manifestBlobUrl, 'manifest-vitrine');
    }

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
 * Pega o ID da empresa a partir da URL, armazenamento local ou cookie.
 * @returns {string|null} O ID da empresa ou nulo.
 */
export function getEmpresaIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const empresaDaUrl = String(params.get('empresa') || '').trim();

    if (empresaDaUrl) {
        persistirEmpresaDaVitrine(empresaDaUrl);
        return empresaDaUrl;
    }

    let empresaDaVitrine = '';
    try {
        empresaDaVitrine = String(
            localStorage.getItem(CHAVE_EMPRESA_VITRINE) || ''
        ).trim();
    } catch (_) {}

    if (empresaDaVitrine) {
        persistirEmpresaDaVitrine(empresaDaVitrine);
        return empresaDaVitrine;
    }

    const empresaDoCookie = lerCookieEmpresa();
    if (empresaDoCookie) {
        persistirEmpresaDaVitrine(empresaDoCookie);
        return empresaDoCookie;
    }

    let empresaAtiva = '';
    try {
        empresaAtiva = String(
            localStorage.getItem('empresaAtivaId') || ''
        ).trim();
    } catch (_) {}

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

export async function getProfissionaisDaEmpresa(empresaId) {
    try {
        const profissionaisRef = collection(db, 'empresarios', empresaId, 'profissionais');
        const snapshot = await getDocs(profissionaisRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar profissionais:", error);
        return [];
    }
}

export async function getTodosServicosDaEmpresa(empresaId) {
    try {
        const servicosRef = collection(db, 'empresarios', empresaId, 'servicos');
        const snapshot = await getDocs(servicosRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar todos os serviços:", error);
        return [];
    }
}

export async function getHorariosDoProfissional(empresaId, profissionalId) {
    try {
        const horariosRef = doc(db, 'empresarios', empresaId, 'profissionais', profissionalId, 'configuracoes', 'horarios');
        const horariosSnap = await getDoc(horariosRef);
        return horariosSnap.exists() ? horariosSnap.data() : null;
    } catch (error) {
        console.error("Erro ao buscar horários do profissional:", error);
        return null;
    }
}
