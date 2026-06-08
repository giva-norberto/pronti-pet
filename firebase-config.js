// ======================================================================
// ARQUIVO: firebase-config.js (PAINEL - VERSÃO 100% ESTÁVEL)
// =====================================================================

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCkJt49sM3n_hIQOyEwzgOmzzdPlsF9PW4",
  authDomain: "pronti-app-37c6e.firebaseapp.com",
  projectId: "pronti-app-37c6e",
  storageBucket: "pronti-app-37c6e.firebasestorage.app",
  messagingSenderId: "736700619274",
  appId: "1:736700619274:web:557aa247905e56fa7e5df3"
};

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

const db = getFirestore(app, "pronti-app");

setPersistence(auth, browserLocalPersistence);

export { app, db, auth, storage, provider };
