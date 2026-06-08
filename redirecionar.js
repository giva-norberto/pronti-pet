// ======================================================================
// ARQUIVO: redirecionar.js (VERSÃO CORRIGIDA E ROBUSTA)
// ======================================================================

// ✅ CORREÇÃO CRÍTICA: Importa o 'db' da configuração da VITRINE, não do painel.
// Isso garante que estamos usando a instância isolada "vitrineCliente".
import { db } from "./vitrini-firebase.js"; 
import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

async function redirecionarUsuario() {
    // Pega os elementos da página para dar feedback ao usuário
    const statusElement = document.querySelector('.container p');
    const spinnerElement = document.querySelector('.spinner');

    try {
        console.log("[Redirecionar] Iniciando processo.");

        // 1. Pega os parâmetros da URL
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('c');
        const isPreview = params.get('preview') === 'true'; // ✨ NOVO: Verifica se é modo preview

        if (!slug) {
            // Se não houver slug, informa o erro claramente.
            throw new Error("Link inválido. O código da página não foi encontrado na URL.");
        }

        console.log(`[Redirecionar] Buscando empresa com slug: ${slug}`);
        if (statusElement) statusElement.textContent = 'Verificando o link...';

        // 2. Monta a consulta no Firestore para encontrar a empresa pelo slug
        const q = query(
            collection(db, "empresarios"), 
            where("slug", "==", slug),
            limit(1) // Otimização: só precisamos de 1 resultado
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            // Se não encontrar nenhuma empresa com esse slug, informa o usuário
            throw new Error("Página não encontrada. Verifique se o link está correto.");
        }

        // 3. Pega o ID longo da empresa encontrada
        const empresaId = snapshot.docs[0].id;
        console.log(`[Redirecionar] Empresa encontrada! ID: ${empresaId}. Redirecionando...`);
        if (statusElement) statusElement.textContent = 'Página encontrada! Redirecionando...';

        // 4. Monta a URL final da vitrine
        let urlFinal = `vitrine.html?empresa=${empresaId}`; // ✨ ALTERADO: de const para let

        // ✨ NOVO: Se era um link de preview, anexa o parâmetro na URL final
        if (isPreview) {
            urlFinal += '&preview=true';
        }

        window.location.replace(urlFinal); // .replace() é melhor para não criar histórico

    } catch (error) {
        console.error("[Redirecionar] Erro fatal:", error);
        // Mostra o erro na tela para o usuário saber o que aconteceu.
        if (statusElement) {
            statusElement.textContent = `Erro: ${error.message}`;
            statusElement.style.color = 'red';
        }
        if (spinnerElement) {
            spinnerElement.style.display = 'none'; // Esconde a animação em caso de erro.
        }
    }
}

// Inicia o processo assim que o DOM da página carrega
// Usar 'DOMContentLoaded' é um pouco mais seguro que chamar a função diretamente.
document.addEventListener('DOMContentLoaded', redirecionarUsuario);
