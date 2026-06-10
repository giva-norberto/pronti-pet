// ======================================================================
// ARQUIVO: vitrini-firebase.js
// VITRINE - VERSÃO REVISADA SEM ALTERAR A LÓGICA
// ======================================================================

import {
  initializeApp,
  getApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// ======================================================================
// CONFIGURAÇÃO FIREBASE DA VITRINE
// ======================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCkJt49sM3n_hIQOyEwzgOmzzdPlsF9PW4",
  authDomain: "pronti-app-37c6e.firebaseapp.com",
  projectId: "pronti-app-37c6e",
  storageBucket: "pronti-app-37c6e.firebasestorage.app",
  messagingSenderId: "736700619274",
  appId: "1:736700619274:web:557aa247905e56fa7e5df3"
};

// ======================================================================
// SINGLETON FIREBASE APP
// ======================================================================
const getFirebaseApp = () => {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
};

const app = getFirebaseApp();

// ======================================================================
// SERVIÇOS FIREBASE
// IMPORTANTE:
// Antes estava usando banco nomeado: getFirestore(app, "pronti-app")
// Agora usa o banco padrão do projeto para encontrar o slug corretamente.
// ======================================================================
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: "select_account"
});

setPersistence(auth, browserLocalPersistence);

// ======================================================================
// EXPORTS
// ======================================================================
export {
  app,
  db,
  auth,
  storage,
  provider
};
