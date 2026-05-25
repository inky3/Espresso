import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

// ชุดข้อมูลของ Espresso โปรเจกต์เดียวเท่านั้น
const firebaseConfig = {
  apiKey: "AIzaSyAyEPJWLp8mXD8bvAGAgNuVocSPo2I6gw4",
  authDomain: "espresso-11e63.firebaseapp.com",
  projectId: "espresso-11e63",
  storageBucket: "espresso-11e63.firebasestorage.app",
  messagingSenderId: "279705218147",
  appId: "1:279705218147:web:2b5dc2d81d2cbd6ba2dc56",
  measurementId: "G-1YDM50QZ5Q"
};

// ป้องกันการ Initialize ซ้ำซ้อนใน Next.js
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app); 

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});