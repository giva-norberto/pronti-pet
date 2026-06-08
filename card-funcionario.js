import { auth } from "./vitrini-firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { abrirModalPerfilProfissional, buscarTodosServicosDaEmpresa, inicializarModalPerfil } from "./modal-perfil-profissional.js";

// Pega empresaId da URL
const urlParams = new URLSearchParams(window.location.search);
const empresaId = urlParams.get("empresaId");

onAuthStateChanged(auth, async (user) => {
  if (!user || !empresaId) {
    window.location.href = "login.html";
    return;
  }

  inicializarModalPerfil();

  // Validação do trial - buscar dados da empresa
  const db = (await import("./vitrini-firebase.js")).db;
  const empresaRef = doc(db, "empresarios", empresaId);
  const empresaSnap = await getDoc(empresaRef);

  if (!empresaSnap.exists()) {
    alert("Empresa não encontrada.");
    window.location.href = "login.html";
    return;
  }

  // Lógica do trial (ajuste conforme seu Firestore)
  const empresaData = empresaSnap.data();
  if (empresaData.dataTrial) {
    const trialAtivo = (Date.now() - empresaData.dataTrial.toMillis()) < 15 * 24 * 60 * 60 * 1000;
    if (!trialAtivo) {
      alert("Seu período de teste acabou.");
      window.location.href = "pagina-pagamento.html";
      return;
    }
  }

  // Busca dados do profissional autenticado
  const profRef = doc(db, "empresarios", empresaId, "profissionais", user.uid);
  const profSnap = await getDoc(profRef);

  // Busca todos os serviços da empresa
  const servicos = await buscarTodosServicosDaEmpresa(db, empresaId);

  // Se não existe, abre modal com campos vazios (não cria nada)
  abrirModalPerfilProfissional(
    profSnap.exists()
      ? { id: user.uid, ...profSnap.data() }
      : { id: user.uid, nome: user.displayName || "", servicos: [], horarios: {} },
    servicos,
    db,
    empresaId
  );
});
