import { db } from "./vitrini-firebase.js";

import {
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

      const endpoint =
        "https://southamerica-east1-pronti-pet.cloudfunctions.net/resolverSlugPublico" +
        "?slug=" + encodeURIComponent(slug);

      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.empresaId) {
        throw new Error(
          payload.error || "Página não encontrada. Verifique se o link está correto."
        );
      }

      empresaId = String(payload.empresaId).trim();
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
