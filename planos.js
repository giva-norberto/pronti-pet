import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// Elementos do DOM
const listaPlanosDiv = document.getElementById('lista-de-planos');
const btnNovoPlano = document.querySelector('.btn-novo');

// Variáveis de estado
let empresaId = null;
let isDono = false;
let isAdmin = false;

// Função para pegar empresa ativa do localStorage
function getEmpresaIdAtiva() {
    return localStorage.getItem("empresaAtivaId") || null;
}

// Inicialização e autenticação
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            empresaId = getEmpresaIdAtiva();
            if (!empresaId) {
                if (listaPlanosDiv) listaPlanosDiv.innerHTML = '<p style="color:red;">Nenhuma empresa ativa selecionada.</p>';
                return;
            }

            const empresaRef = doc(db, "empresarios", empresaId);
            const empresaSnap = await getDoc(empresaRef);
            if (empresaSnap.exists()) {
                const adminUID = "BX6Q7HrVMrcCBqe72r7K76EBPkX2";
                isAdmin = (user.uid === adminUID);
                isDono = (empresaSnap.data().donoId === user.uid);

                // Controle de botão
                if (btnNovoPlano) {
                    btnNovoPlano.style.display = (isDono || isAdmin) ? 'inline-flex' : 'none';
                }
            } else {
                listaPlanosDiv.innerHTML = '<p style="color:red;">Empresa ativa não encontrada.</p>';
                return;
            }

            // Inicie carregamento dos planos normalmente
            carregarPlanos(empresaId);

        } catch (error) {
            console.error("Erro durante a inicialização:", error);
            if (listaPlanosDiv) listaPlanosDiv.innerHTML = `<p style="color:red;">Ocorreu um erro crítico ao carregar os planos.</p>`;
        }
    } else {
        window.location.href = 'login.html';
    }
});

// Sua função carregarPlanos(empresaId) continua igual!
