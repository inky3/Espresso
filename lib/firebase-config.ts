// Shared Firebase configuration. Keep this file free of Firebase SDK imports so server routes can use it safely.
export const firebaseConfig = {
  apiKey: "AIzaSyAyEPJWLp8mXD8bvAGAgNuVocSPo2I6gw4",
  authDomain: "espresso-11e63.firebaseapp.com",
  projectId: "espresso-11e63",
  storageBucket: "espresso-11e63.firebasestorage.app",
  messagingSenderId: "279705218147",
  appId: "1:279705218147:web:2b5dc2d81d2cbd6ba2dc56",
  measurementId: "G-1YDM50QZ5Q",
} as const;

export const FIREBASE_API_KEY = firebaseConfig.apiKey;
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
