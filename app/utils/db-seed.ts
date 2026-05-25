import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = { /* your config */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const seedEspressoMemory = async () => {
  const appId = 'espresso-terminal';
  
  // Hard Skills
  await setDoc(doc(db, 'artifacts', appId, 'memory', 'hard'), {
    content: `
      - Stack: Next.js 16 (App Router/Turbopack), React, Astro, Vite, Tailwind, Mantine, Lucide.
      - Infrastructure: Supabase (REST), Firebase (Cache/Sync), Google Apps Script (V8).
      - Deployment: Vercel (Dynamic), GitHub Actions.
      - Architecture: 4-Path Neural Pipeline, JSON-Schema Workspace Matrix, Persistent Layout Wrappers.
      - Media: CSS 3D Carousel formula, Global Audio Monkey Patching (hard-kill).
      - Pitfalls: No volatile map keys, explicit style-based overrides, explicit border-side definitions.
    `.trim()
  });

  // Soft Skills
  await setDoc(doc(db, 'artifacts', appId, 'memory', 'soft'), {
    content: `
      - Workflow: Phase-by-phase stability, radical data honesty, zero-fluff communication.
      - Aesthetics: Dark #1a1a1a / Gold #D4AF37 palette, Mitr typography, phone-frame-banned structural minimalism.
      - Mobile: Zero-friction sync, touch-target remediation (56px), webkit-tap-highlight-color: transparent.
    `.trim()
  });
};