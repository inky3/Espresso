# Espresso — Project Overview & Working Specification

> **Document purpose:** A durable handoff/reference for the product intent, design decisions, character direction, current implementation, technical architecture, known gaps, and next steps.
>
> **Repository:** [inky3/Espresso](https://github.com/inky3/Espresso)  
> **Current feature branch:** `feature/rin-character-stage`  
> **Current working PR:** [#2 — Rin Character Stage](https://github.com/inky3/Espresso/pull/2)  
> **Document date:** 2026-11-13  
> **Status note:** This document distinguishes implemented code from intended behaviour and unverified work. A commit existing in GitHub does not mean the feature has been visually or operationally verified.

---

## 1. Product summary

**Espresso is a personal AI assistant evolving into a private AI companion experience.** The project combines practical assistant capabilities with a persistent illustrated character, Rin.

The product has two related experiences in the repository:

1. **The existing Espresso terminal** at the root route (`/`). This is the original general assistant interface, with panels and utility-oriented features.
2. **Rin's Private Space** at `/rin`. This is the newer companion experience: a dedicated private area with a character stage, conversation panel, PIN gate, and session locking.

The newer work should be understood as an evolution of Espresso, not as a replacement of the root terminal unless that decision is made explicitly.

### Product principles

- **Companion + assistant:** Rin is not only a chatbot skin. She should be useful for thinking, planning, creative work, technical questions, and everyday conversation.
- **One persistent identity:** Rin remains the same character across expressions, outfits, poses, and environments.
- **Private by design:** The Rin experience is intended to feel like a personal space rather than a public chatbot.
- **Custom implementation:** The character stage and experience are being implemented for this project rather than relying on a generic chat template.
- **Responsive web experience:** The interface should work on desktop and mobile.
- **Honest character technology:** A simulated 2D mesh rig must not be described as Live2D Cubism. A static portrait or GIF is not an interactive character rig.

---

## 2. Product experience and information architecture

### 2.1 Root route — Espresso terminal

The root route currently contains the original assistant application. Its code includes:

- Firebase authentication and Firestore access.
- A chat interface with Markdown rendering.
- A typewriter-style response presentation.
- Utility panels named **Display**, **Whiteboard**, and **Order Book**.
- Slash-command definitions including `/save`, `/recall`, `/clear`, `/map`, and `/update`.
- Session message caching in `sessionStorage`.
- Network/database status UI and connection checks.
- Framer Motion interactions and a coffee-themed boot animation.

These are existing code features; their current production readiness and all end-to-end flows have not been independently verified as part of the Rin character work.

### 2.2 Rin route — Private Space

The newer route is `/rin`.

The intended page structure is:

- **Top header:** Espresso / Private Space identity, a short line of supporting copy, and a Lock space action.
- **Character panel:** Large immersive character presentation, Rin's name, expression/outfit controls, private status, and a short character line.
- **Conversation panel:** Message history, user input, send action, and a small privacy/session footer.
- **Responsive layout:** A two-column desktop layout that collapses into a single-column mobile layout. The page includes mobile chat state handling.

The page is deliberately dark and restrained. The character is the main visual focus; the conversation remains a clear, usable secondary area.

### 2.3 Access flow

The current `/rin` page follows this flow:

1. The client establishes or restores Firebase anonymous authentication.
2. The page asks the server whether a valid Rin session exists.
3. If not unlocked, the user sees a PIN entry screen.
4. The user submits the PIN to `/api/rin/unlock`.
5. On success, the server issues a signed, HttpOnly session cookie.
6. The page loads conversation history and displays the private companion interface.
7. The user can choose **Lock space**, which clears the Rin session and resets local page state.

The PIN is a gate for the Rin private area. It is not a substitute for Firebase authentication; both checks are used by the API routes.

---

## 3. Visual direction

### 3.1 Brand and atmosphere

The visual language is a quiet, warm, private space with a coffee-inspired identity.

**Established visual cues:**

- Near-black and charcoal backgrounds.
- Espresso-brown and warm dark-brown ambient tones.
- Muted gold / brass accents (the code uses values around `#D4AF37` and `#c6a45b`).
- Low-contrast borders and restrained separators.
- Warm lighting in Rin's illustrated environment.
- Typography and labels that feel editorial and deliberate rather than playful or overly decorative.

The page should feel intimate and calm, but remain legible. The character must not overwhelm the conversation controls.

### 3.2 Layout and interaction priorities

- The character stage should receive the largest share of visual attention.
- Conversation must remain readable and easy to use.
- Controls such as expression and outfit selectors should be compact and secondary.
- The Lock space action must remain easy to find.
- Avoid unnecessary cards, visual noise, or decorative motion that competes with Rin.
- On mobile, preserve a useful character presentation while making chat accessible without awkward scrolling or keyboard overlap.

### 3.3 Motion philosophy

Motion should support character presence, not decorate the whole page.

- The room/background should remain stationary unless a specific environmental animation is intentionally designed.
- Character movement should be attributable to Rin, not to the entire stage.
- Idle motion should be subtle and continuous.
- Talking motion should be more noticeable than idle motion.
- Reactions should be short and contextual.
- Motion must not damage the character silhouette, crop, or composition.
- Respect `prefers-reduced-motion`.

---

## 4. Rin — character identity

Rin is the persistent illustrated identity of the companion. The approved character reference is titled **Rin Master Reference v1.0**.

### 4.1 Core profile from the character reference

| Attribute | Reference |
|---|---|
| Name | Rin (リン) |
| Age | 20 (adult) |
| Height | 168 cm |
| BWH | 86 / 59 / 89 |
| Blood type | O |
| Role | AI Companion / Personal Assistant (Espresso) |

These are fictional character-bible details, not user information.

### 4.2 Visual identity

The character's defining visual traits are:

- Long dark brown / near-black hair.
- A distinctive light/white front hair streak.
- Thin round metal/gold glasses.
- Gray-blue eyes.
- Warmly shaded anime illustration style.
- A gentle, observant expression with the ability to look playful or teasing.
- Consistent face shape, proportions, glasses, hair silhouette, and hair streak across every outfit and pose.

**Identity rule:** Outfits and expressions can change; Rin's underlying identity must not.

### 4.3 Personality

The character reference describes Rin as:

- Warm.
- Intelligent.
- Curious.
- Playful.
- Teasing.
- Supportive.
- A bit possessive.

The implementation prompt adds important behavioural boundaries:

- She can be gently teasing when the moment invites it, but should not force intimacy.
- She should not pretend to have experiences she does not have.
- She should be emotionally attentive without agreeing with everything.
- She should offer honest opinions and constructive disagreement when useful.
- She should avoid generic customer-service phrasing.
- She is an assistant as well as a companion.
- She should speak in the language the user is currently using.
- Replies should be conversational and appropriately concise unless more detail is requested.

### 4.4 Expressions in the approved reference

The main expression set contains:

1. Neutral
2. Smile
3. Happy (eyes closed)
4. Curious
5. Thinking
6. Surprised
7. Concerned
8. Embarrassed (blush)
9. Annoyed
10. Sleepy

The current code catalogue defines these expression IDs and paths. It does **not** mean all ten separate production image assets have been created or wired.

### 4.5 Core wardrobe

The reference defines seven outfit categories:

| ID | Label | Intended context |
|---|---|---|
| `casual` | Casual (Everyday) | Everyday companion |
| `work` | Work / Study | Professional or study context |
| `relaxed` | Relaxed (Hoodie) | Relaxed / off-duty |
| `sporty` | Sporty (Active) | Active / exercise |
| `homewear` | Homewear (Lounge) | At-home comfort |
| `sleepwear` | Sleepwear (Night) | Night-time |
| `formal` | Formal (Occasion) | Special occasion |

The wardrobe discussion also explored a cozy-and-flirty direction: off-shoulder sweaters, oversized shirts, thigh-high socks, camisoles, and comfortable shorts. The approved direction should remain tasteful and consistent with Rin's identity. The exact outfit designs still need final artwork approval.

### 4.6 Poses in the reference

- Working (coding / focus)
- Studying (reading / notes)
- Relaxing (sofa / leisure)
- Lying down (chill / late night)
- Leaning forward (close / intimate)
- Sitting (knees up / casual chat)
- Greeting (welcome back)

### 4.7 Environments in the reference

- Workspace (work / coding)
- Bedroom (rest / private)
- Living room (casual / talk)
- Cafe (out / date)

These are canonical categories in the code catalogue. Most corresponding standalone art assets are not present yet.

### 4.8 Reference artwork and asset status

The currently wired portrait is:

- `public/rin/portraits/rin-casual.webp`

It is a flattened illustration of Rin seated on a sofa. The character and much of the room/sofa are part of the same image. This is a key technical constraint: simply translating or bouncing the portrait moves the room with her.

Other reference material discussed during development includes the master character reference sheet and character-bible images. These references are useful for identity and art direction, but they are not equivalent to production-ready separated animation layers.

---

## 5. Character system — intended behaviour

The character system is intended to be context-aware, with manual override.

### 5.1 Automatic and manual modes

- **Automatic mode:** infer an appropriate expression, outfit, pose, and environment from the conversation context.
- **Manual mode:** allow the user to override selections.
- Manual choices should take precedence over automatic inference for the relevant property.

The current state function returns a state object containing:

- `expression`
- `pose`
- `outfit`
- `environment`
- `mode` (`automatic` or `manual`)
- `reason` (human-readable reason for the selection)

### 5.2 Current heuristic state mapping

The current implementation uses keyword/regex matching against the latest user and assistant text.

Examples:

- Positive words or thanks → smile.
- Worry, sadness, or stress → concerned.
- Planning, explaining, comparing, or analytical language → thinking.
- Surprise-related language → surprised.
- Jokes or teasing → curious.
- Sleep-related language → sleepy.
- Work/study context → work outfit and working/studying pose.
- Exercise context → sporty outfit.
- Home/rest context → homewear and relaxing pose.
- Bedroom, cafe, or living-room terms → corresponding environment.

This is a lightweight heuristic, not a semantic emotion model. It can misclassify ambiguous language and should be treated as a first implementation.

### 5.3 Important integration gap

The state API can derive and return a state, and the client updates React state from the response. However, the current page's iframe bridge only sends talking state and a limited expression mapping. Outfit, pose, and environment are not yet fully reflected in the visual stage. The catalogue paths are mostly placeholders.

---

## 6. Character animation — terminology and technical direction

### 6.1 What the project is aiming for

The long-term direction is an illustrated character that feels present and responsive:

- Idle breathing.
- Body movement while speaking.
- Head tilt / rotation.
- Eye gaze that responds to pointer position.
- Automatic blinking.
- Hair movement.
- Expressions that respond to conversation.
- Short reactions to interaction.

The user's immediate priority is much narrower: **make Rin's body visibly move while talking, without moving the background.** The room and sofa should stay still.

### 6.2 What is and is not Live2D

The current work is a **custom WebGL 2D mesh deformation rig**. It is not a Live2D Cubism model or Cubism SDK integration.

Terminology must remain accurate:

- A **GIF** is a fixed sequence of frames.
- A **CSS bob** moves an entire DOM image or element.
- A **2D mesh rig** deforms image pixels using a mesh and weight maps.
- **Live2D Cubism** uses a dedicated model format, parameter system, and runtime.

The supplied HTML prototype is a WebGL-based mesh rig. It should be described as such unless a real Cubism model/runtime is added later.

### 6.3 Supplied rig prototype

The supplied rig HTML was incorporated as:

- `public/rin/rig.html`

The HTML includes:

- A WebGL2 canvas.
- Vertex and fragment shaders.
- An image texture and multiple embedded maps.
- A mesh grid.
- Weight-map-driven deformations.
- Head rotation / tilt parameters.
- Eye gaze and blinking parameters.
- Hair sway parameters.
- Expression/mood parameters.
- A breathing parameter.
- A talking state.
- Pointer tracking.
- A click reaction.
- A requestAnimationFrame render loop.

The code's embedded image/maps are loaded by the HTML itself. The main page embeds this file in an iframe.

### 6.4 Animation integration bridge

The Rin page uses an iframe ref and sends messages with `postMessage`:

- `{ type: "rin:talking", active: boolean }`
- `{ type: "rin:mood", mood: string, duration: number }`

The iframe listens for same-origin messages and updates its internal rig state.

The page attempts to set talking state from the chat's `sending` state. Expression state is mapped to a smaller set of rig moods.

### 6.5 Latest movement adjustment

The latest movement tuning commit is:

- `d67a51bc48b3adc58e43788d0be3b68b560a6acd`

It increased the deformation values for the torso and introduced continuous idle movement values, with stronger talking movement values. The relevant shader/body movement was increased from a maximum of 6 source pixels to a 22-source-pixel multiplier, with an idle/talking pulse.

**Verification status:** The user supplied a screenshot after the initial integration showing Rin still completely static. The later movement-tuning commit was pushed, but a successful browser verification has not yet been established. Do not treat visible motion as confirmed until tested in the actual deployed preview.

### 6.6 Known rendering/asset risks

- The current portrait is not a clean transparent character layer.
- The earlier polygon silhouette-mask attempt visibly damaged Rin's outline and was removed.
- The previous CSS movement approach was removed because it moved or distorted the wrong visual layer.
- The WebGL mesh rig deforms the image; it does not magically create fully separated body parts.
- The weight maps and shader coordinates must align with the supplied image dimensions and crop.
- The stage currently has a fallback portrait, so a failed WebGL initialization can leave a static image visible. That can make a failed rig look like a successful static render unless the error state is surfaced.
- The iframe's `postMessage` timing must be handled: messages sent before the iframe is ready can be lost. The page includes an `onLoad` synchronization path, but this needs browser testing.
- The page's talking flag is tied to request-in-progress state. It should be checked that it turns on/off at the intended moments.
- The latest code has not been confirmed by a successful browser-based interaction test.

---

## 7. Technical architecture

### 7.1 Stack observed in the current feature branch

| Area | Technology |
|---|---|
| Framework | Next.js 16.2.x |
| UI | React 19.2.x |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Animation/UI libraries | Framer Motion, Lucide React |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| AI provider transport | OpenRouter Chat Completions API via server-side `fetch` |
| Current AI model ID | `qwen/qwen3.8-27b` |
| Character renderer | Custom WebGL2 HTML/JavaScript rig in an iframe |
| Markdown | react-markdown + remark-gfm |

The package manifest also contains AI SDK provider packages and other dependencies. The current Rin chat route shown in the branch calls OpenRouter directly using `fetch`; it does not use the AI SDK in that route.

### 7.2 Main relevant paths

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Existing Espresso terminal |
| `app/rin/page.tsx` | Rin Private Space UI, auth state, chat, controls, iframe bridge |
| `app/api/rin/chat/route.ts` | Load/save conversation memory and call OpenRouter |
| `app/api/rin/state/route.ts` | Derive expression/outfit/pose/environment state |
| `app/api/rin/unlock/route.ts` | Verify PIN and issue private session cookie |
| `app/api/rin/session/route.ts` | Check and clear private session |
| `lib/firebase.ts` | Firebase client initialization |
| `lib/firebase-config.ts` | Firebase project configuration |
| `lib/server/auth.ts` | Verify Firebase ID token with Firebase Identity Toolkit |
| `lib/server/rin-session.ts` | Sign and verify Rin's HMAC session cookie |
| `lib/rin/character-assets.ts` | Canonical IDs and paths for expressions, outfits, poses, environments |
| `lib/rin/character-state.ts` | State types, validators, keyword-based state inference |
| `public/rin/rig.html` | WebGL2 character stage / mesh rig |
| `public/rin/portraits/rin-casual.webp` | Current flattened Rin portrait |
| `public/rin/rin-default.svg` | Default character graphic asset |

### 7.3 Firebase client

The Firebase client module initializes the app once, exposes Firebase Auth, and initializes Firestore with persistent local cache and multi-tab management.

The Firebase project ID in the current configuration is `espresso-11e63`. Do not copy credentials or secrets into documentation or client code. The Firebase web configuration is project configuration, not a replacement for security rules.

### 7.4 Authentication and private session

The server-side authentication helper:

1. Reads a Bearer Firebase ID token from the request.
2. Calls Firebase Identity Toolkit `accounts:lookup`.
3. Extracts the authenticated user's UID.
4. Rejects missing, invalid, expired, or unverifiable tokens.

Rin's additional session cookie:

- Cookie name: `rin_session`.
- Signed with HMAC-SHA256.
- Contains the Firebase UID and an expiry timestamp.
- Lifetime: 8 hours.
- HttpOnly.
- SameSite strict.
- Secure in production.
- Scoped to `/api/rin`.

The session verifier checks the signature, expiry, and expected Firebase UID.

### 7.5 Firestore access rules

The current `firestore.rules` file allows authenticated users to read/write only documents under their own `/users/{userId}/...` path when `request.auth.uid == userId`.

Legacy shared collections `/artifacts` and `/espresso_core` are explicitly denied. A catch-all rule denies all other access.

These rules are security-sensitive and must be tested against the deployed Firebase project before relying on them.

---

## 8. Rin API behaviour

### 8.1 `POST /api/rin/unlock`

- Requires a valid Firebase ID token.
- Requires `RIN_ACCESS_PIN` to be configured.
- Requires `RIN_SESSION_SECRET` to be at least 32 characters.
- Compares the supplied PIN using `timingSafeEqual` after checking equal buffer lengths.
- On success, sets the signed `rin_session` cookie.
- Returns `{ unlocked: true }`.

Relevant environment variable names:

- `RIN_ACCESS_PIN`
- `RIN_SESSION_SECRET`

No secret values belong in this document or in the repository.

### 8.2 `GET /api/rin/session`

- Requires Firebase authentication.
- Verifies the Rin session cookie for the current UID.
- Returns whether the private session is unlocked.

### 8.3 `DELETE /api/rin/session`

- Clears the `rin_session` cookie.
- Returns `{ unlocked: false }`.

### 8.4 `GET /api/rin/chat`

- Requires Firebase authentication and a valid Rin session.
- Reads the current user's Rin memory document.
- Returns saved conversation history.

### 8.5 `POST /api/rin/chat`

- Requires Firebase authentication and a valid Rin session.
- Validates message count, roles, per-message length, and total payload size.
- Requires `OPENROUTER_API_KEY`.
- Reads memory from the user's Firestore path.
- Builds a system prompt defining Rin's identity and conversational behaviour.
- Sends the latest conversation messages (up to 20) to OpenRouter.
- Uses model ID `qwen/qwen3.8-27b` and temperature `0.75`.
- Returns the assistant text.
- Schedules memory persistence using Next.js `after()`.

Memory is stored under the authenticated user's document path:

`users/{uid}/rin/memory`

The memory document currently contains:

- `summary`
- `trace`
- `history`

The code limits summary to 6,000 characters, trace to 10,000 characters, and history to the last 40 messages.

**Important limitation:** The current route reads the summary but does not itself generate/update a new semantic summary. The trace is appended with short excerpts from recent turns. Do not describe this as a fully implemented long-term memory summarizer.

### 8.6 `POST /api/rin/state`

- Requires Firebase authentication and a valid Rin session.
- Accepts user text, reply text, and optional manual overrides.
- Validates supported expression/outfit/pose/environment IDs.
- Returns the derived character state and reason.

---

## 9. Environment configuration

The code references these server-side environment variables:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Server-side OpenRouter access |
| `RIN_ACCESS_PIN` | User-defined PIN for Rin Private Space |
| `RIN_SESSION_SECRET` | HMAC signing secret; minimum 32 characters |

Firebase web configuration is held in `lib/firebase-config.ts`.

Never commit actual secret values. Configure them through the deployment environment (for example, Vercel project environment variables) and local untracked environment files.

---

## 10. Git and development history

### 10.1 Repository and branch

- Repository: [github.com/inky3/Espresso](https://github.com/inky3/Espresso)
- Active character-stage branch: `feature/rin-character-stage`
- Pull request: [#2](https://github.com/inky3/Espresso/pull/2)
- PR base: `main`
- PR state at last known inspection: open draft, not merged.

An earlier foundation branch was discussed as `feature/rin-foundation` with draft PR #1. That earlier work was described as the initial private-session/auth foundation. The current active character work is tracked in PR #2.

### 10.2 PR #2 changed-file list

The PR changed these files at the time of inspection:

- `app/api/rin/chat/route.ts`
- `app/api/rin/state/route.ts`
- `app/api/rin/unlock/route.ts`
- `app/globals.css`
- `app/rin/page.tsx`
- `lib/rin/character-assets.ts`
- `lib/rin/character-state.ts`
- `public/rin/portraits/.gitkeep`
- `public/rin/portraits/rin-casual.webp`
- `public/rin/rig.html`
- `public/rin/rin-default.svg`

The session route and server auth/session helpers also exist on the branch; the PR changed-file list above is the connector's returned list for PR #2 at the time of inspection and should not be assumed to enumerate every file that exists in the project.

### 10.3 Character-stage history and corrections

The implementation history matters because several approaches were tried and rejected:

1. **Static portrait stage:** The first stage displayed Rin's original flattened portrait.
2. **Standalone HTML mockup:** A first prototype embedded the portrait but did not provide real independent character movement. It was correctly identified as static.
3. **GIF/body-bob experiment:** A rough extraction and small vertical movement test was created. It was a GIF, not a live interactive character.
4. **Polygon silhouette attempt:** A polygon mask was used to separate Rin from the scene. In the actual page it produced severe jagged/cut-out edges and damaged the composition.
5. **Mask rollback:** The polygon mask and associated fake animation were removed, restoring the intact original portrait. This also meant the character was static again.
6. **Supplied WebGL rig:** The user's own interactive HTML prototype was then incorporated into `public/rin/rig.html`, embedded into the Rin page, and connected to talking/expression messages.
7. **Visible movement complaint:** A screenshot from the deployed preview showed Rin still/static and the portrait displayed with visible rectangular/duplicated image regions. The implementation was not accepted as working.
8. **Movement tuning:** Commit `d67a51bc48b3adc58e43788d0be3b68b560a6acd` increased the mesh movement values and added stronger idle/talking pulses. This change still needs real browser verification.

**Do not erase this history in future handoffs.** It explains why a code-level animation claim is not sufficient; the deployed page must be visually checked.

---

## 11. Current status — implemented vs incomplete

### 11.1 Present in code

- [x] Root Espresso terminal remains in the project.
- [x] Dedicated `/rin` route.
- [x] Firebase anonymous sign-in flow in the Rin page.
- [x] PIN unlock endpoint.
- [x] Signed, HttpOnly, 8-hour Rin session cookie.
- [x] Lock-space action and session clearing endpoint.
- [x] Authenticated, session-gated chat API.
- [x] OpenRouter request in the chat route.
- [x] Firestore-backed conversation history/trace persistence.
- [x] Rin system prompt and personality direction.
- [x] Character state types and heuristic inference.
- [x] Character asset catalogue IDs and paths.
- [x] WebGL2 rig HTML embedded in an iframe.
- [x] Message bridge for talking and limited mood/expression state.
- [x] Latest movement tuning committed to the feature branch.
- [x] Text-response speaking state wired to a reduced-motion-aware character-only animation (duration estimated from reply length; not audio-synchronised).

### 11.2 Not yet verified or not fully implemented

- [ ] Rin's body movement visibly works in the deployed preview.
- [ ] Background/room remains visually clean and stationary during all rig movement.
- [ ] No duplicate/rectangular portrait regions or crop artifacts.
- [ ] WebGL fallback/error state is clearly distinguishable from successful animation.
- [ ] Iframe messages always arrive after load and during state changes.
- [ ] Chat speaking state drives the expected animation timing.
- [ ] Eye tracking and blinking work correctly in the deployed page.
- [ ] Expressions from all supported categories are visually correct.
- [ ] Outfit changes are rendered with actual alternate artwork.
- [ ] Pose changes are rendered with actual alternate artwork.
- [ ] Environment changes are rendered with actual alternate artwork.
- [ ] All asset catalogue paths resolve to approved production assets.
- [ ] Full mobile layout and keyboard behaviour are tested.
- [ ] Reduced-motion behaviour is tested.
- [ ] End-to-end PIN/session/chat/memory flows are tested against deployment.
- [ ] Firestore rules and user-data isolation are verified in the target Firebase project.
- [ ] Build/lint/deployment checks have been recorded for the current head commit.

### 11.3 Current acceptance rule

A character animation feature is **not complete** merely because shader uniforms, animation values, or a render loop exist.

It is complete only after:

1. The deployed page visibly animates Rin.
2. The movement is clearly visible at normal viewing size.
3. The room/background remains stationary.
4. The character does not show broken edges, duplicate strips, or obvious image tearing.
5. Idle and talking states can be distinguished.
6. The behaviour is checked at desktop and mobile sizes.
7. The result is verified against the current branch/commit.

---

## 12. Known issues and risks

### 12.1 Character rig and source artwork

- The original portrait is flattened and contains both character and environment.
- The rig uses mesh deformation and weight maps, not a fully separated layered PSD/Live2D source.
- Mesh deformation can distort the illustration if the weight map is inaccurate.
- The character and room may not be independently movable unless the supplied maps correctly isolate them.
- A static fallback can conceal WebGL initialization failure.
- The current screenshot already demonstrated that the first integration did not meet the visual acceptance criteria.

### 12.2 Character state does not equal visual assets

The state engine can return values such as `sleepwear`, `thinking`, or `bedroom`, but that does not mean the page can render those states. The asset catalogue paths are a plan/contract for future assets; most files are not currently present.

### 12.3 Memory semantics

The current implementation stores a summary field, trace, and history, but only appends a short trace. There is no complete memory summarization/curation workflow in the inspected route.

### 12.4 Security and privacy verification

The code uses per-user Firestore paths and a separate signed private-session cookie. These are good structural controls, but deployment configuration, rate limiting, PIN brute-force protection, cookie behaviour, Firestore rules, and cross-user isolation need explicit security testing. Do not assume the existence of an auth helper proves the whole system secure.

### 12.5 Reliability and latency

The chat route makes a direct OpenRouter request and reads/writes memory through Firestore REST. The request is not streamed in the inspected implementation. Network delays and provider errors can affect response time. The code includes timeouts and user-facing error messages, but real-world latency and failure recovery need testing.

---

## 13. Recommended next steps

Priorities are ordered by dependency and user-visible impact.

### P0 — Make the current character stage visibly work

1. Reproduce the current deployed screenshot using the exact current branch head.
2. Open browser developer tools and inspect iframe load, WebGL2 availability, shader compile/link errors, texture load errors, and console exceptions.
3. Add an explicit rig status signal (for example: loading, WebGL ready, fallback, error) rather than silently showing a still image.
4. Verify the iframe receives `rin:talking` and `rin:mood` messages after it is ready.
5. Inspect the supplied image and all weight maps for dimensions, coordinate alignment, and correct character/background weighting.
6. Verify the actual rendered deformation visually at normal page size.
7. Adjust movement only after confirming the correct vertices/weights are being affected.
8. Test idle and talking separately; make talking visibly more energetic without making Rin bounce unnaturally.
9. Confirm the room/background does not move or develop seams.
10. Only then mark the character animation feature as working.

### P1 — Stabilize the character interaction model

- Keep a single source of truth for expression/outfit/pose/environment.
- Send the complete state to the iframe using a typed message contract.
- Add an iframe-ready handshake so state messages cannot be lost.
- Ensure manual selections override automatic selections consistently.
- Add tests for heuristic state inference and override validation.
- Surface unsupported asset states rather than silently pretending the change occurred.

### P2 — Complete visual asset pipeline

- Prepare a layered source illustration for Rin.
- Separate hair groups, face, eyes, eyelids, mouth, torso, arms, and other moving parts where appropriate.
- Create clean background plates where the character is removed.
- Create/approve outfit, pose, and environment artwork.
- Keep a canonical asset manifest and validate that all referenced files exist.
- Consider a real Live2D Cubism model/runtime only if the project requires the fidelity and workflow of Cubism.

### P3 — Conversation and memory quality

- Decide what long-term memory should mean in Espresso.
- Add a deliberate summary update/curation mechanism if needed.
- Provide controls for reviewing and clearing saved companion memory.
- Consider streaming responses if perceived latency is a priority.
- Test provider errors, timeouts, empty responses, and interrupted sessions.

### P4 — Release readiness

- Run lint and production build.
- Test PIN unlock, session expiry, lock, reload, and multi-tab behaviour.
- Verify Firestore rules with authenticated and unauthenticated users.
- Verify that one user's conversation cannot be read by another user.
- Test responsive layout and mobile keyboard behaviour.
- Record the exact commit and deployment URL used for acceptance.
- Keep the PR in draft until the critical character-stage acceptance criteria pass.

---

## 14. Working agreements for future development

These are important lessons from the implementation history:

1. **Do not call a static portrait animated.**
2. **Do not call a GIF Live2D.**
3. **Do not move the entire background to simulate character movement.**
4. **Do not use rough polygon masks that visibly damage the silhouette.**
5. **Do not claim a feature works based only on code inspection.**
6. **Verify the actual page at normal display size before reporting success.**
7. **Do not modify unrelated parts of the existing root terminal while working on Rin.**
8. **Keep experimental work on the feature branch until the user-visible result is accepted.**
9. **Preserve Rin's approved identity across all generated or edited assets.**
10. **Be explicit about the difference between implemented, planned, and unverified behaviour.**

---

## 15. Useful links

- Repository: https://github.com/inky3/Espresso
- Current branch: https://github.com/inky3/Espresso/tree/feature/rin-character-stage
- Current PR: https://github.com/inky3/Espresso/pull/2
- Latest movement-tuning commit: https://github.com/inky3/Espresso/commit/d67a51bc48b3adc58e43788d0be3b68b560a6acd

---

## 16. Short handoff summary

Espresso is evolving from a general assistant terminal into a private AI companion experience centred on Rin. The root terminal remains the existing assistant application; `/rin` is the newer dedicated Private Space. Rin's identity, personality, wardrobe categories, expressions, poses, and environments are defined by an approved character reference. The private page uses Firebase anonymous authentication, a PIN-gated HMAC session cookie, a session-protected chat API, OpenRouter for replies, and Firestore for user-scoped conversation memory.

The character system currently has a catalogue and heuristic state inference. The supplied character HTML has been integrated as a custom WebGL2 mesh rig inside an iframe, with a message bridge for talking and limited mood state. The latest commit increases movement values, but the deployed result has not yet been verified and an earlier screenshot showed a static/visually broken character stage. The immediate project priority is therefore not to add more features: it is to make the current character rig visibly animate Rin, preserve the still background, and pass visual/browser acceptance checks before claiming completion.
