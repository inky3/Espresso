/**
 * Canonical Rin asset catalogue.
 *
 * The IDs and descriptions are grounded in the approved Rin Master Reference v1.0.
 * Image files are intentionally not fabricated here: add production artwork at each
 * path when the matching standalone asset has been prepared and approved.
 */
export const RIN_ASSET_CATALOG = {
  expressions: {
    neutral: { label: "Neutral", path: "/rin/expressions/neutral.webp" },
    smile: { label: "Smile", path: "/rin/expressions/smile.webp" },
    happy: { label: "Happy", path: "/rin/expressions/happy.webp" },
    curious: { label: "Curious", path: "/rin/expressions/curious.webp" },
    thinking: { label: "Thinking", path: "/rin/expressions/thinking.webp" },
    surprised: { label: "Surprised", path: "/rin/expressions/surprised.webp" },
    concerned: { label: "Concerned", path: "/rin/expressions/concerned.webp" },
    embarrassed: { label: "Embarrassed", path: "/rin/expressions/embarrassed.webp" },
    annoyed: { label: "Annoyed", path: "/rin/expressions/annoyed.webp" },
    sleepy: { label: "Sleepy", path: "/rin/expressions/sleepy.webp" },
  },
  outfits: {
    casual: { label: "Casual (Everyday)", path: "/rin/outfits/casual.webp" },
    work: { label: "Work / Study", path: "/rin/outfits/work.webp" },
    relaxed: { label: "Relaxed (Hoodie)", path: "/rin/outfits/relaxed.webp" },
    sporty: { label: "Sporty (Active)", path: "/rin/outfits/sporty.webp" },
    homewear: { label: "Homewear (Lounge)", path: "/rin/outfits/homewear.webp" },
    sleepwear: { label: "Sleepwear (Night)", path: "/rin/outfits/sleepwear.webp" },
    formal: { label: "Formal (Occasion)", path: "/rin/outfits/formal.webp" },
  },
  poses: {
    working: { label: "Working", path: "/rin/poses/working.webp" },
    studying: { label: "Studying", path: "/rin/poses/studying.webp" },
    relaxing: { label: "Relaxing", path: "/rin/poses/relaxing.webp" },
    lying: { label: "Lying down", path: "/rin/poses/lying.webp" },
    leaning: { label: "Leaning forward", path: "/rin/poses/leaning.webp" },
    seated: { label: "Sitting", path: "/rin/poses/seated.webp" },
    greeting: { label: "Greeting", path: "/rin/poses/greeting.webp" },
  },
  environments: {
    workspace: { label: "Workspace", path: "/rin/environments/workspace.webp" },
    bedroom: { label: "Bedroom", path: "/rin/environments/bedroom.webp" },
    living: { label: "Living room", path: "/rin/environments/living.webp" },
    cafe: { label: "Cafe", path: "/rin/environments/cafe.webp" },
  },
} as const;

export type RinExpressionId = keyof typeof RIN_ASSET_CATALOG.expressions;
export type RinOutfitId = keyof typeof RIN_ASSET_CATALOG.outfits;
export type RinPoseId = keyof typeof RIN_ASSET_CATALOG.poses;
export type RinEnvironmentId = keyof typeof RIN_ASSET_CATALOG.environments;
