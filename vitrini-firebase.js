// ======================================================================
// ARQUIVO: vitrini-firebase.js (VITRINE - VERSÃO FINALÍSSIMA E CORRETA)
// =====================================================================

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// ✅ CONFIGURAÇÃO FINAL COM TODAS AS SUAS CORREÇÕES
const firebaseConfig = {
  apiKey: "AIzaSyCkJt49sM3n_hIQOyEwzgOmzzdPlsF9PW4",       // Sua Chave Correta
  authDomain: "pronti-app-37c6e.firebaseapp.com",
  projectId: "pronti-app-37c6e",
  storageBucket: "pronti-app-37c6e.firebasestorage.app", // Seu StorageBucket Correto
  messagingSenderId: "736700619274",
  appId: "1:736700619274:web:557aa247905e56fa7e5df3"
};

// Sua lógica Singleton original, 100% preservada.
const getFirebaseApp = ( ) => {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
};

const app = getFirebaseApp();
const auth = getAuth(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: 'select_account'
});

// Sua inicialização do banco de dados, 100% preservada.
const db = getFirestore(app, "pronti-app");

setPersistence(auth, browserLocalPersistence);

export { app, db, auth, storage, provider };
