// ======================================================================
// ARQUIVO: vitrini-firebase.js
// VITRINE - PRONTI PET
// Mesma configuração do firebase-config.js do painel
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

const firebaseConfig = {
  apiKey: "AIzaSyDxbb2_onT2gbQahqogcddCOjNTWbwjb0k",
  authDomain: "pronti-pet.firebaseapp.com",
  projectId: "pronti-pet",
  storageBucket: "pronti-pet.firebasestorage.app",
  messagingSenderId: "970443692765",
  appId: "1:970443692765:web:21b8e61ff165f36e46d934"
};

const getFirebaseApp = () => {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
};

const app = getFirebaseApp();

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: "select_account"
});

setPersistence(auth, browserLocalPersistence);

export {
  app,
  db,
  auth,
  storage,
  provider
};
