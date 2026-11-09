# Rin Foundation — Setup Notes

This branch introduces the first private-access and data-isolation layer for Rin.

## Required deployment configuration

Add these server-side environment variables to Vercel (Production, Preview and Development as appropriate):

- `OPENROUTER_API_KEY` — existing server-side model key.
- `RIN_ACCESS_PIN` — the PIN used at `/rin`. Keep it private; never use a `NEXT_PUBLIC_` prefix.
- `RIN_SESSION_SECRET` — a random secret of at least 32 characters. Generate one with `openssl rand -base64 48`.

Do not commit real values to Git.

## Deploy Firestore security rules

The new app data is stored beneath `users/{uid}/...`. The rules in `firestore.rules` allow an authenticated user to access only their own subtree and deny access to legacy shared paths.

Before the new data paths can be used in production, deploy the rules to the Firebase project configured in `lib/firebase-config.ts` (`espresso-11e63`):

```bash
npm install -g firebase-tools
firebase login
firebase use espresso-11e63
firebase deploy --only firestore:rules
```

Review the Firebase project selected by the CLI before deployment.

## Important data note

The old Order Book used a shared `artifacts/espresso-terminal/public/data/archives` collection. This branch moves new records to `users/{uid}/archives`. Existing legacy records are not copied automatically because the old collection was shared and its ownership cannot be safely inferred. Keep a backup and decide how to handle legacy records before deleting or migrating them.

The older assistant memory path on the mismatched `espresso-23681` project is no longer used by the chat API. New memory is stored per Firebase UID in the configured `espresso-11e63` project.

## Rin access behavior

- `/rin` requires a signed-in Firebase identity and a server-side PIN.
- Successful unlock creates an eight-hour, HttpOnly, SameSite=Strict signed session cookie.
- The PIN and signing secret are checked only on the server.
- The current in-memory attempt throttle is best-effort per server instance. Replace it with a shared rate-limit store before scaling production traffic.
- The private character stage, chat, appearance state engine, and persistent Rin-specific memory are not implemented in this foundation yet.

## Validation status

The changes were committed to `feature/rin-foundation`. A full install, TypeScript check, production build, Firebase rules deployment, and live authentication test still need to be run in the project's environment before merging.
