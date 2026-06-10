import { db } from "./vitrini-firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

async function redirecionarUsuario() {
  const statusElement = document.querySelector(".container p");
  const spinnerElement = document.querySelector(".spinner");

  try {
    const params = new URLSearchParams(window.location.search);

    const slug = (params.get("c") || params.get("slug") || "").trim().toLowerCase();
    const empresaParam = (params.get("empresa") || "").trim();
    const isPreview = params.get("preview") === "true";

    if (statusElement) {
      statusElement.textContent = "Verificando o link...";
    }

    let empresaId = "";

    if (empresaParam) {
      const empresaRef = doc(db, "empresarios", empresaParam);
      const empresaSnap = await getDoc(empresaRef);

      if (!empresaSnap.exists()) {
        throw new Error("Empresa não encontrada.");
      }

      empresaId = empresaParam;
    } else {
      if (!slug) {
        throw new Error("Link inválido. O código da página não foi encontrado na URL.");
      }

      const q = query(
        collection(db, "empresarios"),
        where("slug", "==", slug),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error("Página não encontrada. Verifique se o link está correto.");
      }

      empresaId = snapshot.docs[0].id;
    }

    let urlFinal = `vitrine.html?empresa=${encodeURIComponent(empresaId)}`;

    if (isPreview) {
      urlFinal += "&preview=true";
    }

    window.location.replace(urlFinal);

  } catch (error) {
    console.error("[Redirecionar] Erro fatal:", error);

    if (statusElement) {
      statusElement.textContent = `Erro: ${error.message}`;
      statusElement.style.color = "red";
    }

    if (spinnerElement) {
      spinnerElement.style.display = "none";
    }
  }
}

document.addEventListener("DOMContentLoaded", redirecionarUsuario);
