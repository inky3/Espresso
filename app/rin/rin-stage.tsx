'use client';

/* eslint-disable @next/next/no-img-element -- layered, pre-optimised sprites need plain <img> stacking */

import { useEffect, useRef, useState } from "react";
import { isNightAt, outfitArt, ROOMS, type OutfitArt, type PoseId, type RoomId } from "@/lib/rin/scene";

/**
 * Azur Lane-style character stage: a still room (day/night crossfade, softly
 * blurred) with Rin as a separate cut-out sprite on top. Only Rin moves:
 * gentle breathing while idle, a small hop when she speaks, a light motion
 * for each feeling, and a full pose image for strong moments.
 */

export type TimeMode = "auto" | "day" | "night";

type FaceArt = "neutral" | "happy" | "thinking" | "angry" | "depressed" | "flustered-teasing" | "frustrated" | "sad" | "sleepy" | "teasing-1" | "teasing-2" | "teasing-3" | "tired" | "unintended-teasing" | "teasing";

/** Faces that exist for each outfit. Add a face here once its /rin/sprite/<outfit>-<face>.webp exists. */
const AVAILABLE_FACES: Record<OutfitArt, FaceArt[]> = {
  casual: ["neutral", "happy", "thinking", "angry", "depressed", "flustered-teasing", "sad", "sleepy", "teasing-1", "teasing-2", "teasing-3", "tired", "unintended-teasing"],
  hoodie: ["neutral", "happy", "thinking", "angry", "depressed", "flustered-teasing", "frustrated", "sad", "sleepy", "teasing-1", "teasing-2", "teasing-3", "tired", "unintended-teasing"],
  shirt: ["neutral", "happy", "thinking", "angry", "depressed", "frustrated", "sad", "sleepy", "teasing", "teasing-2", "teasing-3", "tired"],
};

/** Strong-moment poses that exist for each outfit: /rin/sprite/<outfit>-pose-<pose>.webp */
const AVAILABLE_POSES: Record<OutfitArt, PoseId[]> = {
  casual: ["chin", "cheer", "cheeks", "hands", "wave"],
  hoodie: ["chin", "cheer", "cheeks", "hands", "wave"],
  shirt: ["chin", "cheer", "cheeks", "hands", "wave"],
};

const SPRITES = (Object.keys(AVAILABLE_FACES) as OutfitArt[]).flatMap((outfit) => [
  ...AVAILABLE_FACES[outfit].map((face) => `${outfit}-${face}`),
  ...AVAILABLE_POSES[outfit].map((pose) => `${outfit}-pose-${pose}`),
]);
/** Horizontal focus per room, so the open floor sits behind Rin. */
const ROOM_FOCUS: Record<RoomId, string> = { kitchen: "44% 50%", bedroom: "47% 50%" };

/** Outfits that have artwork. Everything else falls back to the closest one. */
export const SUPPORTED_OUTFITS = [
  { id: "casual", label: "Casual" },
  { id: "relaxed", label: "Hoodie" },
  { id: "homewear", label: "Oversized shirt" },
] as const;

/** Expressions that have artwork (casual outfit). */
export const SUPPORTED_EXPRESSIONS = [
  { id: "neutral", label: "Neutral" },
  { id: "happy", label: "Happy" },
  { id: "thinking", label: "Thinking" },
  { id: "angry", label: "Angry" },
  { id: "depressed", label: "Depressed" },
  { id: "flustered-teasing", label: "Flustered teasing" },
  { id: "frustrated", label: "Frustrated" },
  { id: "sad", label: "Sad" },
  { id: "sleepy", label: "Sleepy" },
  { id: "teasing-1", label: "Teasing 1" },
  { id: "teasing-2", label: "Teasing 2" },
  { id: "teasing-3", label: "Teasing 3" },
  { id: "tired", label: "Tired" },
  { id: "unintended-teasing", label: "Unintended teasing" },
] as const;

/** Poses, offered in the same menu as faces. Picking one holds it until changed. */
export const SUPPORTED_POSES = [
  { id: "chin", label: "Thinking hard" },
  { id: "cheer", label: "Excited" },
  { id: "cheeks", label: "Flustered" },
  { id: "hands", label: "Worried" },
  { id: "wave", label: "Waving" },
] as const;

function expressionArt(expression: string): FaceArt {
  if (["smile", "embarrassed", "curious", "surprised"].includes(expression)) return "happy";
  if (expression === "concerned") return "neutral";
  if (expression === "teasing") return "teasing-1";
  return ([
    "neutral", "happy", "thinking", "angry", "depressed", "flustered-teasing",
    "frustrated", "sad", "sleepy", "teasing-1", "teasing-2", "teasing-3",
    "tired", "unintended-teasing",
  ] as string[]).includes(expression) ? expression as FaceArt : "neutral";
}

/** Each pose belongs to a feeling; without pose art, that feeling's light motion is used, stronger. */
const POSE_FEELING: Record<PoseId, string> = {
  chin: "thinking",
  cheer: "happy",
  cheeks: "embarrassed",
  hands: "concerned",
  wave: "smile",
};

/** Light, code-only motion per feeling (works for every outfit, no extra art). */
const LIGHT_MOTION: Record<string, { transform: string; hop?: number }> = {
  thinking: { transform: "rotate(-1.8deg)" },
  curious: { transform: "rotate(2deg)" },
  concerned: { transform: "translateY(-0.6%) scale(1.015)" },
  embarrassed: { transform: "rotate(1.4deg) translateY(0.7%)" },
  happy: { transform: "none", hop: 0.5 },
  surprised: { transform: "translateY(-0.4%)", hop: 0.9 },
  annoyed: { transform: "rotate(-1deg)" },
  sleepy: { transform: "rotate(1.2deg) translateY(0.9%)" },
};

/** Picks the sprite to show, and whether the wanted face is missing for this outfit. */
export function spriteFor(outfit: string, expression: string, pose?: PoseId | null) {
  const o = outfitArt(outfit);
  if (pose && AVAILABLE_POSES[o].includes(pose)) {
    return { key: `${o}-pose-${pose}`, missingThinking: false, poseArt: true };
  }
  const feeling = pose ? POSE_FEELING[pose] : expression;
  const wanted = expressionArt(feeling);
  const outfitFallbacks: Partial<Record<FaceArt, FaceArt>> = o === "casual"
    ? { frustrated: "angry" }
    : o === "shirt"
      ? { "flustered-teasing": "teasing", "teasing-1": "teasing", "unintended-teasing": "teasing-3" }
      : {};
  const candidates = [wanted, outfitFallbacks[wanted], "neutral"].filter(Boolean) as FaceArt[];
  const face = candidates.find((candidate) => AVAILABLE_FACES[o].includes(candidate)) ?? "neutral";
  return { key: `${o}-${face}`, missingThinking: wanted === "thinking" && face !== "thinking", poseArt: false };
}

/** Doubles a light-motion transform for strong moments that have no pose art yet. */
function amplify(transform: string) {
  return transform.replace(/(-?\d*\.?\d+)(deg|%)/g, (_, n: string, unit: string) => `${(parseFloat(n) * 1.8).toFixed(2)}${unit}`);
}

const isNightNow = () => isNightAt();

export default function RinStage({
  room = "kitchen",
  outfit,
  expression,
  pose = null,
  hopSignal,
  timeMode,
  speaking = false,
}: {
  room?: RoomId;
  outfit: string;
  expression: string;
  /** A strong moment (hand on chin, wave, …). Shown briefly; the page clears it. */
  pose?: PoseId | null;
  /** Increment `id` to make Rin hop; `strength` 0–1 scales the jump. */
  hopSignal: { id: number; strength: number };
  timeMode: TimeMode;
  /** True while Rin is delivering a text reply; only the character layer moves. */
  speaking?: boolean;
}) {
  const hopRef = useRef<HTMLDivElement>(null);
  const [autoNight, setAutoNight] = useState(() => isNightNow());
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setAutoNight(isNightNow()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const hop = (strength: number) => {
    if (reducedMotion || !hopRef.current) return;
    const h = -14 * Math.max(0.3, Math.min(1, strength));
    hopRef.current.animate(
      [
        { transform: "translateY(0) scale(1, 1)" },
        { transform: "translateY(0) scale(1.012, 0.988)", offset: 0.12 },
        { transform: `translateY(${h}px) scale(0.994, 1.008)`, offset: 0.45 },
        { transform: "translateY(0) scale(1.01, 0.99)", offset: 0.8 },
        { transform: "translateY(0) scale(1, 1)" },
      ],
      { duration: 460, easing: "cubic-bezier(.3,.7,.4,1)" },
    );
  };
  const hopRefFn = useRef(hop);
  useEffect(() => {
    hopRefFn.current = hop;
  });

  useEffect(() => {
    if (hopSignal.id) hopRefFn.current(hopSignal.strength);
  }, [hopSignal]);

  const feeling = pose ? POSE_FEELING[pose] : expression;
  const motion = LIGHT_MOTION[feeling];

  // A little extra bounce when she becomes happy/surprised, or strikes a pose.
  useEffect(() => {
    if (pose) hopRefFn.current(0.7);
    else if (motion?.hop) hopRefFn.current(motion.hop);
  }, [feeling, pose, motion?.hop]);

  const night = timeMode === "night" || (timeMode === "auto" && autoNight);
  const { key: active, missingThinking, poseArt } = spriteFor(outfit, expression, pose);
  const lightTransform = reducedMotion || poseArt || !motion ? "none" : pose ? amplify(motion.transform) : motion.transform;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#140c08]" data-room={room} data-time={night ? "night" : "day"} data-sprite={active} data-pose={pose ?? ""}>
      {/* Room: never moves. Slight blur + dim so Rin reads as the subject. */}
      {ROOMS.flatMap(({ id }) =>
        (["day", "night"] as const).map((time) => (
          <img
            key={`${id}-${time}`}
            src={`/rin/rooms/${id}-${time}.webp`}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading={id === room ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full scale-[1.04] select-none object-cover transition-opacity duration-[1200ms] ease-in-out"
            style={{
              opacity: id === room && (time === "night") === night ? 1 : 0,
              objectPosition: ROOM_FOCUS[id],
              filter: `blur(2.5px) brightness(${night ? 0.82 : 0.9})`,
            }}
          />
        )),
      )}

      {/* Rin */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[-5%] top-[4%] flex justify-center">
        <div ref={hopRef} className="relative h-full origin-bottom" style={{ aspectRatio: "633 / 1024" }}>
          <div className="absolute inset-0 origin-bottom transition-transform duration-500 ease-out" style={{ transform: lightTransform }}>
            <div className={`absolute inset-0 origin-bottom ${speaking ? "rin-speaking" : ""}`}>
              <div className="rin-breathe absolute inset-0 origin-bottom">
              {SPRITES.map((key) => (
                <img
                  key={key}
                  src={`/rin/sprite/${key}.webp`}
                  alt={key === active ? "Rin, with long dark hair, a white streak in her bangs and round gold glasses" : ""}
                  aria-hidden={key === active ? undefined : true}
                  draggable={false}
                  className="absolute inset-0 h-full w-full select-none object-contain object-bottom transition-[opacity,filter] duration-200 ease-out"
                  style={{
                    opacity: key === active ? 1 : 0,
                    filter: night
                      ? "brightness(0.8) sepia(0.32) saturate(1.12) hue-rotate(-6deg) drop-shadow(0 18px 30px rgba(0,0,0,0.35))"
                      : "brightness(1) sepia(0.08) saturate(1.04) drop-shadow(0 18px 30px rgba(0,0,0,0.22))",
                    maskImage: "linear-gradient(to top, transparent 0%, black 9%)",
                    WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 9%)",
                  }}
                />
              ))}
              </div>
            </div>
          </div>
          {/* Fallback "thinking" cue for outfits that have no thinking face yet. */}
          <div
            aria-hidden="true"
            className="absolute right-[6%] top-[3%] flex items-center gap-1 rounded-full border border-white/15 bg-[#120d0a]/75 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-300"
            style={{ opacity: missingThinking ? 1 : 0, transform: missingThinking ? "translateY(0) scale(1)" : "translateY(6px) scale(0.9)" }}
          >
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="rin-think-dot h-1.5 w-1.5 rounded-full bg-[#e9dcc6]" style={{ animationDelay: `${dot * 160}ms` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
