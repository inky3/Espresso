import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase'; // shared instance: no second initializeApp, no placeholder config

// One-off dev helper. Call it manually (e.g. from a temporary button or script), then remove the call.
// NOTE: the hook reads memory from `espresso_core/B`, while this writes to
// `artifacts/espresso-terminal/memory/*`. Make sure whichever file reads these paths matches.
const APP_ID = 'espresso-terminal';

export const seedEspressoMemory = async () => {
  // Hard Skills
  await setDoc(doc(db, 'artifacts', APP_ID, 'memory', 'hard'), {
    content: `
- Stack: Next.js 16 (App Router/Turbopack), React, Astro, Vite, Tailwind, Mantine, Lucide.
- Infrastructure: Supabase (REST), Firebase (Cache/Sync), Google Apps Script (V8).
- Deployment: Vercel (Dynamic), GitHub Actions.
- Architecture: 4-Path Neural Pipeline, JSON-Schema Workspace Matrix, Persistent Layout Wrappers.
- Media: CSS 3D Carousel formula, Global Audio Monkey Patching (hard-kill).
- Pitfalls: No volatile map keys, explicit style-based overrides, explicit border-side definitions.
`.trim(),
  });

  // Soft Skills
  await setDoc(doc(db, 'artifacts', APP_ID, 'memory', 'soft'), {
    content: `
- Workflow: Phase-by-phase stability, radical data honesty, zero-fluff communication.
- Aesthetics: Dark #1a1a1a / Gold #D4AF37 palette, Mitr typography, phone-frame-banned structural minimalism.
- Mobile: Zero-friction sync, touch-target remediation (56px), webkit-tap-highlight-color: transparent.
`.trim(),
  });
};