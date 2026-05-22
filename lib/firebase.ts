import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCucOqHhVLimHDam9vJR8ILB9YaMgGvgKA",
  authDomain: "espresso-23681.firebaseapp.com",
  projectId: "espresso-23681",
  storageBucket: "espresso-23681.firebasestorage.app",
  messagingSenderId: "348422573603",
  appId: "1:348422573603:web:1469e0969501d3fcbd2b96",
  measurementId: "G-7PRBR3WNEF"
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