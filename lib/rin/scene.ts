/**
 * What is currently on screen in Rin's private space (outfit, room, time of
 * day). Shared by the stage (client) and the chat route (server) so Rin's
 * replies match what the user actually sees.
 */

export type OutfitArt = "casual" | "hoodie" | "shirt";
export type RoomId = "kitchen";
export type TimeOfDay = "day" | "night";

/** Maps a catalogue outfit ID to the artwork that exists for it. */
export function outfitArt(outfit: string): OutfitArt {
  if (outfit === "relaxed") return "hoodie";
  if (outfit === "homewear" || outfit === "sleepwear") return "shirt";
  return "casual";
}

const OUTFIT_DESCRIPTIONS: Record<OutfitArt, string> = {
  casual: "a cream oversized cable-knit sweater and a dark brown pleated skirt",
  hoodie: "an oversized charcoal-gray hoodie with the hood down and black lounge shorts",
  shirt: "an oversized white button-up shirt slipping off one shoulder, with short gray lounge shorts underneath",
};

const ROOM_DESCRIPTIONS: Record<RoomId, string> = {
  kitchen: "your cozy home kitchen, with a brass espresso machine on the counter",
};

export function isNightAt(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < 6 * 60 || minutes >= 17 * 60 + 30;
}

/** Outfits Rin can choose for herself (catalogue IDs that have artwork). */
export const WARDROBE = ["casual", "relaxed", "homewear"] as const;
export type WardrobeId = (typeof WARDROBE)[number];

/** Faces Rin can ask for. The stage maps them to the closest existing art. */
export const EXPRESSION_IDS = [
  "neutral", "smile", "happy", "curious", "thinking", "surprised", "concerned", "embarrassed", "annoyed", "sleepy",
] as const;

/** Strong-moment poses Rin can strike briefly. */
export const POSE_IDS = ["chin", "cheer", "cheeks", "hands", "wave"] as const;
export type PoseId = (typeof POSE_IDS)[number];

const POSE_NOTES: Record<PoseId, string> = {
  chin: "hand on chin, for thinking hard about a tricky question",
  cheer: "hands clasped near your chest, for real excitement or delight",
  cheeks: "hands on your cheeks, for being very flustered or embarrassed",
  hands: "hands held together at your chest, for real worry or concern",
  wave: "a small wave, for hello or goodbye",
};

const WARDROBE_NOTES: Record<WardrobeId, string> = {
  casual: `${OUTFIT_DESCRIPTIONS.casual} (everyday, daytime)`,
  relaxed: `${OUTFIT_DESCRIPTIONS.hoodie} (cozy, relaxing, chilly evenings)`,
  homewear: `${OUTFIT_DESCRIPTIONS.shirt} (lazy mornings, late nights at home, getting ready for bed)`,
};

/** Builds the scene note for Rin's system prompt. Unknown values are ignored. */
export function describeScene(scene: unknown): string | null {
  if (!scene || typeof scene !== "object") return null;
  const { outfit, room, time, outfitLocked } = scene as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof outfit === "string" && outfit.length <= 32) {
    lines.push(`You are wearing ${OUTFIT_DESCRIPTIONS[outfitArt(outfit)]}.`);
  }
  if (typeof room === "string" && room in ROOM_DESCRIPTIONS) {
    lines.push(`You are in ${ROOM_DESCRIPTIONS[room as RoomId]}.`);
  }
  if (time === "day" || time === "night") {
    lines.push(time === "day" ? "It is daytime, with soft sunlight coming in." : "It is night, and the room is lit by warm lamps.");
  }
  if (!lines.length) return null;
  const wardrobe = WARDROBE.map((id) => `- ${id}: ${WARDROBE_NOTES[id]}`).join("\n");
  return `${lines.join(" ")}

YOUR WARDROBE (you change clothes yourself):
${wardrobe}
${outfitLocked === true
    ? "The user picked your current outfit themselves. Keep it unless they ask you to change."
    : "Change outfit only when it genuinely fits the moment (getting cozy, late at night, relaxing, starting the day) or when the user asks. Do not change often; most replies keep the current outfit."}
To change, end your reply with [[outfit:ID]] on its own line, using an ID from the list. You may mention changing in your own words, but never mention or explain the tag.
You may also end your reply with [[expression:ID]] to choose the face you show for this reply. IDs: ${EXPRESSION_IDS.join(", ")}.
For a strong moment only, you may add [[pose:ID]]; it shows for a few seconds, then you relax. Use it rarely, at most once every several replies. Poses:
${POSE_IDS.map((id) => `- ${id}: ${POSE_NOTES[id]}`).join("\n")}`;
}

/** Removes Rin's [[outfit:…]] / [[expression:…]] tags from a reply and returns the valid choices. */
export function parseDirectives(reply: string): { text: string; outfit?: WardrobeId; expression?: string; pose?: PoseId } {
  let outfit: WardrobeId | undefined;
  let expression: string | undefined;
  let pose: PoseId | undefined;
  const text = reply
    .replace(/\[\[\s*(outfit|expression|pose)\s*:\s*([a-z_-]+)\s*\]\]/gi, (_, kind: string, id: string) => {
      const value = id.toLowerCase();
      if (kind.toLowerCase() === "pose" && (POSE_IDS as readonly string[]).includes(value)) pose = value as PoseId;
      if (kind.toLowerCase() === "outfit" && (WARDROBE as readonly string[]).includes(value)) outfit = value as WardrobeId;
      if (kind.toLowerCase() === "expression" && (EXPRESSION_IDS as readonly string[]).includes(value)) expression = value;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, outfit, expression, pose };
}
