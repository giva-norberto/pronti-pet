// selector-empresa.js
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

(async () => {
  console.log("Selector iniciado");

  const params = new URLSearchParams(window.location.search);
  const empresaId = params.get("empresa");

  if (!empresaId) return;

  const ref = doc(db, "empresarios", empresaId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const data = snap.data();
  const tipo = data.tipoEmpresa || data.tipo || "padrao"; // ← CORREÇÃO IMPORTANTE

  console.log("Tipo de empresa:", tipo);

  if (tipo === "pets" || tipo === "pet") {
    window.location.replace(`vitrine-pet.html?empresa=${empresaId}`);
  } else {
    window.location.replace(`vitrine.html?empresa=${empresaId}`);
  }
})();
