'use client';

/* eslint-disable @next/next/no-img-element -- layered, pre-optimised sprites need plain <img> stacking */

import { useEffect, useRef, useState } from "react";

/**
 * Azur Lane-style character stage: a still room (day/night crossfade, softly
 * blurred) with Rin as a separate cut-out sprite on top. Only Rin moves:
 * gentle breathing while idle, a small hop when she speaks.
 */

export type TimeMode = "auto" | "day" | "night";

type SpriteKey = "casual-neutral" | "casual-happy" | "casual-thinking" | "hoodie-neutral";

const SPRITES: SpriteKey[] = ["casual-neutral", "casual-happy", "casual-thinking", "hoodie-neutral"];
const ROOM = "kitchen";

/** Outfits that have artwork. Everything else falls back to the closest one. */
export const SUPPORTED_OUTFITS = [
  { id: "casual", label: "Casual" },
  { id: "relaxed", label: "Hoodie" },
] as const;

/** Expressions that have artwork (casual outfit). */
export const SUPPORTED_EXPRESSIONS = [
  { id: "neutral", label: "Soft smile" },
  { id: "happy", label: "Happy" },
  { id: "thinking", label: "Thinking" },
] as const;

function outfitArt(outfit: string): "casual" | "hoodie" {
  return outfit === "relaxed" || outfit === "homewear" || outfit === "sleepwear" ? "hoodie" : "casual";
}

function expressionArt(expression: string): "neutral" | "happy" | "thinking" {
  if (["happy", "smile", "embarrassed", "curious", "surprised"].includes(expression)) return "happy";
  if (expression === "thinking") return "thinking";
  return "neutral";
}

export function spriteFor(outfit: string, expression: string): SpriteKey {
  const o = outfitArt(outfit);
  if (o === "hoodie") return "hoodie-neutral"; // only one hoodie expression exists so far
  return `casual-${expressionArt(expression)}` as SpriteKey;
}

function isNightNow(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < 6 * 60 || minutes >= 17 * 60 + 30;
}

export default function RinStage({
  outfit,
  expression,
  hopSignal,
  timeMode,
}: {
  outfit: string;
  expression: string;
  /** Increment `id` to make Rin hop; `strength` 0–1 scales the jump. */
  hopSignal: { id: number; strength: number };
  timeMode: TimeMode;
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

  useEffect(() => {
    if (!hopSignal.id || reducedMotion || !hopRef.current) return;
    const h = -14 * Math.max(0.3, Math.min(1, hopSignal.strength));
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
  }, [hopSignal, reducedMotion]);

  const night = timeMode === "night" || (timeMode === "auto" && autoNight);
  const active = spriteFor(outfit, expression);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#140c08]" data-room={ROOM} data-time={night ? "night" : "day"} data-sprite={active}>
      {/* Room: never moves. Slight blur + dim so Rin reads as the subject. */}
      {(["day", "night"] as const).map((time) => (
        <img
          key={time}
          src={`/rin/rooms/${ROOM}-${time}.webp`}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full scale-[1.04] select-none object-cover object-[44%_50%] transition-opacity duration-[1500ms] ease-in-out"
          style={{ opacity: (time === "night") === night ? 1 : 0, filter: `blur(2.5px) brightness(${night ? 0.82 : 0.9})` }}
        />
      ))}

      {/* Rin */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[-5%] top-[4%] flex justify-center">
        <div ref={hopRef} className="relative h-full origin-bottom" style={{ aspectRatio: "633 / 1024" }}>
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
    </div>
  );
}
