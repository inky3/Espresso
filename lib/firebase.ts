import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCia58uUHOSKPJuLPbWkkhtqsRRk7wOG_k",
  authDomain: "sebai-a4e6c.firebaseapp.com",
  projectId: "sebai-a4e6c",
  storageBucket: "sebai-a4e6c.firebasestorage.app",
  messagingSenderId: "524305789553",
  appId: "1:524305789553:web:8212c9a9d0f23a258821d0",
  measurementId: "G-XJN0QXFJM7"
};

// Next.js hot-reloading safeguard
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Make sure 'export' is at the start of these two lines!
export const auth = getAuth(app); 

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});