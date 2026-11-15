/**
 * What is currently on screen in Rin's private space (outfit, room, time of
 * day). Shared by the stage (client) and the chat route (server) so Rin's
 * replies match what the user actually sees.
 */

export type OutfitArt = "casual" | "hoodie" | "shirt" | "after-dark";
export const ROOMS = [
  { id: "kitchen", label: "Kitchen" },
  { id: "bedroom", label: "Bedroom" },
] as const;
export type RoomId = (typeof ROOMS)[number]["id"];
export type TimeOfDay = "day" | "night";

/** Maps a catalogue outfit ID to the artwork that exists for it. */
export function outfitArt(outfit: string): OutfitArt {
  if (outfit === "relaxed") return "hoodie";
  if (outfit === "homewear" || outfit === "sleepwear") return "shirt";
  if (outfit === "after-dark") return "after-dark";
  return "casual";
}

const OUTFIT_DESCRIPTIONS: Record<OutfitArt, string> = {
  casual: "a cream oversized cable-knit sweater and a dark brown pleated skirt",
  hoodie: "an oversized charcoal-gray hoodie with the hood down and black lounge shorts",
  shirt: "an oversized white button-up shirt slipping off one shoulder, with short gray lounge shorts underneath",
  "after-dark": "the After Dark dress outfit",
};

const ROOM_DESCRIPTIONS: Record<RoomId, string> = {
  kitchen: "your cozy home kitchen, with a brass espresso machine on the counter",
  bedroom: "your cozy bedroom, with a wooden bed, a soft rug and a little lamp on the nightstand",
};

export function isNightAt(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < 6 * 60 || minutes >= 17 * 60 + 30;
}

/** Outfits Rin can choose for herself (catalogue IDs that have artwork). */
export const WARDROBE = ["casual", "relaxed", "homewear", "after-dark"] as const;
export type WardrobeId = (typeof WARDROBE)[number];

/** Faces Rin can ask for. The stage maps them to the closest existing art. */
export const EXPRESSION_IDS = [
  "neutral", "smile", "happy", "very-happy", "curious", "thinking", "hard-thinking", "surprised", "concerned", "worried", "embarrassed", "hello", "annoyed", "sleepy",
  "angry", "depressed", "flustered-teasing", "frustrated", "sad", "teasing-1", "teasing-2", "teasing-3", "tired", "unintended-teasing",
  "seduce-1", "seduce-2", "seduce-3",
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
  homewear: `${OUTFIT_DESCRIPTIONS.shirt} (casual, friendly, relaxed time at home; this is the current shirt look, not a dedicated pajama outfit)`,
  "after-dark": `${OUTFIT_DESCRIPTIONS["after-dark"]} (a special look for a sustained, mutually welcomed flirtatious moment)`,
};

/** Builds the scene note for Rin's system prompt. Unknown values are ignored. */
export function describeScene(scene: unknown): string | null {
  if (!scene || typeof scene !== "object") return null;
  const { outfit, room, time, outfitLocked, roomLocked } = scene as Record<string, unknown>;
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
    : "Do not change clothes because of the clock, time of day, or a single keyword. Outfit changes must grow naturally out of the conversation over multiple turns. Keep the current outfit during the early stages; let your expression and tone change first."}
OUTFIT PROGRESSION:
- After Dark route: Start with the current outfit. At the first mild, welcomed flirtatious moment, show only light teasing (teasing-1); do not change clothes. If the user reciprocates over further exchanges, build through teasing-2 and teasing-3, still in the same clothes. Only after sustained, clearly mutual flirtation should you move naturally into seduce-1/2/3. Change into after-dark only at a later, earned turning point after that momentum has built across several exchanges. A single compliment, joke, or flirty phrase is never enough. If the user cools the mood or changes topic, stop escalating and keep the current outfit.
- Shirt (homewear) route: This is separate from flirting. Start in the current outfit and respond to friendly, relaxed, familiar conversation with warm or playful expressions first. If that comfortable at-home mood continues over several exchanges, then change to homewear. Do not treat one casual phrase or a mention of being at home as enough. This is the existing oversized-shirt artwork, not dedicated pajamas; do not describe it as pajamas or imply new pajama artwork exists.
- Expressions can change without changing clothes. Keep outfit changes rare and meaningful. Never use time-of-day as a reason by itself.
YOUR ROOMS (you can move between them):
${ROOMS.map((r) => `- ${r.id}: ${ROOM_DESCRIPTIONS[r.id]}`).join("\n")}
${roomLocked === true
    ? "The user picked the current room themselves. Stay there unless they ask to move."
    : "Move only when it fits the moment (making coffee or a snack, going to bed, winding down) or when the user asks. Most replies stay in the same room."}
To move, end your reply with [[room:ID]] on its own line. You may mention it naturally ("come, let's sit in my room").

To change outfit, end your reply with [[outfit:ID]] on its own line, using an ID from the list. You may mention changing in your own words, but never mention or explain the tag.
You may also end your reply with [[expression:ID]] to choose the face you show for this reply. IDs: ${EXPRESSION_IDS.join(", ")}.
Seduction expressions are available as seduce-1 (subtle, gentle closeness), seduce-2 (confident, playful flirtation), and seduce-3 (strong, unmistakable flirtation). Use them only when the user's tone and the established conversation clearly invite flirtation; progress naturally and never force intimacy.
For a strong moment only, you may add [[pose:ID]]; it shows for a few seconds, then you relax. Use it rarely, at most once every several replies. Poses:
${POSE_IDS.map((id) => `- ${id}: ${POSE_NOTES[id]}`).join("\n")}`;
}

/** Removes Rin's [[outfit:…]] / [[expression:…]] tags from a reply and returns the valid choices. */
export function parseDirectives(reply: string): { text: string; outfit?: WardrobeId; expression?: string; pose?: PoseId; room?: RoomId } {
  let room: RoomId | undefined;
  let outfit: WardrobeId | undefined;
  let expression: string | undefined;
  let pose: PoseId | undefined;
  const text = reply
    .replace(/\[\[\s*(outfit|expression|pose|room)\s*:\s*([a-z_-]+)\s*\]\]/gi, (_, kind: string, id: string) => {
      const value = id.toLowerCase();
      if (kind.toLowerCase() === "room" && ROOMS.some((r) => r.id === value)) room = value as RoomId;
      if (kind.toLowerCase() === "pose" && (POSE_IDS as readonly string[]).includes(value)) pose = value as PoseId;
      if (kind.toLowerCase() === "outfit" && (WARDROBE as readonly string[]).includes(value)) outfit = value as WardrobeId;
      if (kind.toLowerCase() === "expression" && (EXPRESSION_IDS as readonly string[]).includes(value)) expression = value;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, outfit, expression, pose, room };
}
