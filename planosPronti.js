// ======================================================================
// 📁 Arquivo: planosPronti.js
// 🎯 Objetivo:
// Sincronizar (criar/atualizar) planos no Firestore
// Suporta sincronização total e atualizações individuais da UI
// ======================================================================

// 🔌 Importa instância do Firestore já configurada
import { db } from "./firebase-config.js";

// 🔥 Funções do Firestore para criar/atualizar documentos
import { 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// 📦 Importa a fonte de verdade dos planos (arquivo versionado no GitHub)
import { PLANOS_PRONTI } from "./planos-pronti.js";


// ======================================================================
// 🚀 FUNÇÃO: sincronizarPlanosUnico
// ======================================================================
// Recebe um objeto de plano e salva no Firestore.
// Usada pela tela de administração para salvar edições manuais.
// ======================================================================
async function sincronizarPlanosUnico(plano) {
    try {
        const ref = doc(db, "planosPronti", plano.id);

        await setDoc(ref, {
            id: plano.id,
            nome: plano.nome,
            limiteFuncionarios: plano.limiteFuncionarios,
            preco: plano.preco,
            linkMP: plano.linkMP,
            updatedAt: serverTimestamp() // Garante horário preciso do servidor
        }, { merge: true });

        console.log(`✅ Documento ${plano.id} sincronizado com sucesso.`);
    } catch (error) {
        console.error(`❌ Erro ao sincronizar plano ${plano.id}:`, error);
        throw error;
    }
}


// ======================================================================
// 🚀 FUNÇÃO PRINCIPAL: sincronizarPlanos
// ======================================================================
// Percorre todos os planos definidos no arquivo local (planos-pronti.js)
// e realiza a carga em massa para o Firestore.
// ======================================================================
async function sincronizarPlanos() {
    try {
        console.log("🚀 Iniciando sincronização em massa...");

        for (const plano of PLANOS_PRONTI) {
            await sincronizarPlanosUnico(plano);
        }

        alert("🔥 Todos os planos foram sincronizados com o Firebase!");

    } catch (error) {
        console.error("❌ Erro na sincronização em massa:", error);
        alert("Erro ao sincronizar todos os planos. Verifique o console.");
    }
}


// ======================================================================
// 🌐 EXPOSIÇÃO GLOBAL
// ======================================================================
// Torna as funções acessíveis para chamadas via HTML (onclick)
// ======================================================================
window.sincronizarPlanos = sincronizarPlanos;
window.sincronizarPlanosUnico = sincronizarPlanosUnico;
